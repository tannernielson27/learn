import { z } from "zod";
import type { ItemInputOf, ItemOf, ItemType, RichText } from "../schemas";
import {
  normalizeMarkdown,
  parseAnswer,
  parseScoringRule,
  readMarked,
  type StatedRule,
} from "./text";

/**
 * AI drafts (#337, ADR 0008 pipeline steps 5–6). A draft is what Claude fills in for one question:
 * plain strings copied from the source, answer marks included. It never holds ids, tokens or
 * offsets; `fromDraft` builds those deterministically. Every description below is sent to the
 * model as part of the JSON Schema, so it is written as an instruction.
 */

const COPY = "Copy it word for word from the source.";
const NEVER_WRITE =
  "Leave it out when the source has none. Never write one yourself, and never add a mark the source does not have.";

export const draftEnvelopeFields = {
  stem: z
    .string()
    .describe(
      `The question itself, as markdown. ${COPY} Leave out the answer, the rationale, the scoring rule and any instructor notes.`,
    ),
  instructions: z
    .string()
    .optional()
    .describe(
      `An instruction printed apart from the question, such as "Select all that apply." ${COPY}`,
    ),
  rationale: z
    .string()
    .optional()
    .describe(
      `The rationale or explanation the source gives for the whole question, as markdown. ${COPY} ${NEVER_WRITE}`,
    ),
  statedScoring: z
    .string()
    .optional()
    .describe(
      `The scoring rule exactly as the source states it, such as "Scoring Rule: +/-". Leave it out when the source states none.`,
    ),
};

export const draftOptionSchema = z.object({
  text: z
    .string()
    .describe(
      `One option, without its letter or number. ${COPY} When the source marks it as an answer with * or a check mark, keep that mark in the text. ${NEVER_WRITE}`,
    ),
  rationale: z
    .string()
    .optional()
    .describe(`Why this option is right or wrong, if the source says so. ${COPY} ${NEVER_WRITE}`),
});
export type DraftOption = z.infer<typeof draftOptionSchema>;

export const draftAnswerField = z
  .string()
  .optional()
  .describe(
    `A key printed apart from the options, such as "Answer: B" or an answer section at the back, ${COPY.toLowerCase()} Leave it out when the options carry their own marks or the source has no key. Never work out an answer yourself.`,
  );

/** Why a converted draft is not ready to import as it stands. #343 turns these into a status. */
export type DraftReasonCode =
  /** The source has no key. The item carries an empty key that only the teacher may fill in. */
  | "needs_answer"
  /** The draft cannot become a valid item as it stands; a repair or the teacher must fix it. */
  | "needs_fix"
  /** The source states a scoring rule the spec does not allow for this type; the default is used. */
  | "scoring_conflict";

export interface DraftReason {
  code: DraftReasonCode;
  /** Plain words for the reviewer. */
  message: string;
  /** Where in the draft the problem is, when it is one place. */
  path?: (string | number)[];
}

/**
 * The envelope fields a document does not state. The importer supplies them: the id when it
 * stages the entry, the step when it assembles a case study (#344).
 */
export interface DraftContext {
  id?: string;
  tags?: string[];
  cjmmStep?: 1 | 2 | 3 | 4 | 5 | 6;
  difficulty?: "easy" | "medium" | "hard";
}

/**
 * A converted draft. `item` is shaped like the type's item input; with a `needs_answer` or
 * `needs_fix` reason it may not pass `itemSchema` (an empty key, for instance), and the caller
 * must not treat it as valid until it does.
 */
export interface DraftConversion<T extends ItemType> {
  item: ItemInputOf<T>;
  reasons: DraftReason[];
}

/** The id an item gets when the caller does not name one. */
export const DEFAULT_DRAFT_ITEM_ID = "ai_draft";

export const markdown = (value: string): RichText => ({ kind: "markdown", value });

/** Trimmed markdown, or undefined for text that is absent or blank. */
export function optionalMarkdown(value: string | undefined): RichText | undefined {
  if (value === undefined) return undefined;
  const text = normalizeMarkdown(value);
  return text === "" ? undefined : markdown(text);
}

/** The envelope every converter shares: ids from the context, text from the draft. */
export function envelopeOf(
  draft: { stem: string; instructions?: string; rationale?: string },
  context: DraftContext,
  perElement: Record<string, RichText>,
) {
  const instructions =
    draft.instructions === undefined ? "" : normalizeMarkdown(draft.instructions);
  const general = optionalMarkdown(draft.rationale);
  const hasPerElement = Object.keys(perElement).length > 0;
  return {
    id: context.id ?? DEFAULT_DRAFT_ITEM_ID,
    ...(context.tags !== undefined ? { tags: [...context.tags] } : {}),
    ...(context.cjmmStep !== undefined ? { cjmmStep: context.cjmmStep } : {}),
    ...(context.difficulty !== undefined ? { difficulty: context.difficulty } : {}),
    stem: markdown(normalizeMarkdown(draft.stem)),
    ...(instructions !== "" ? { instructions } : {}),
    rationale: {
      ...(general ? { general } : {}),
      ...(hasPerElement ? { perElement } : {}),
    },
  };
}

/** Collects per-element rationales the source gave, keyed by the ids the converter built. */
export function perElementOf(
  entries: readonly { id: string; rationale?: string }[],
): Record<string, RichText> {
  return Object.fromEntries(
    entries.flatMap(({ id, rationale }) => {
      const text = optionalMarkdown(rationale);
      return text ? [[id, text] as const] : [];
    }),
  );
}

/** The envelope text fields of an item, as a draft holds them. */
export function envelopeDraftOf(item: ItemOf<ItemType>, statedScoring: string) {
  return {
    stem: item.stem.value,
    ...(item.instructions !== undefined ? { instructions: item.instructions } : {}),
    ...(item.rationale.general ? { rationale: item.rationale.general.value } : {}),
    statedScoring,
  };
}

/** The rationale a draft carries for one element, if the item has one. */
export function elementRationale(item: ItemOf<ItemType>, id: string): { rationale?: string } {
  const text = item.rationale.perElement?.[id]?.value;
  return text !== undefined ? { rationale: text } : {};
}

/** How the spec scores a type, and which stated rules it accepts in place of the default. */
export interface ScoringPolicy<Rule extends StatedRule = StatedRule> {
  default: Rule;
  allowed: readonly Rule[];
}

/** The words `toDraft` writes for each rule; `parseScoringRule` reads them back. */
export const STATED_RULE_TEXT: Record<StatedRule, string> = {
  zero_one: "Scoring Rule: 0/1",
  plus_minus: "Scoring Rule: +/-",
  rationale: "Scoring Rule: Rationale",
  position: "Scoring Rule: 0/1 per position",
};

/**
 * The rule a draft is scored by: the stated one when the spec allows it for the type, else the
 * default with a `scoring_conflict` reason that quotes the source.
 */
export function resolveScoring<Rule extends StatedRule>(
  stated: string | undefined,
  policy: ScoringPolicy<Rule>,
): { rule: Rule; reasons: DraftReason[] } {
  if (stated === undefined || stated.trim() === "") return { rule: policy.default, reasons: [] };
  const rule = parseScoringRule(stated);
  if (rule !== undefined && (policy.allowed as readonly StatedRule[]).includes(rule)) {
    return { rule: rule as Rule, reasons: [] };
  }
  const quoted = stated.trim();
  return {
    rule: policy.default,
    reasons: [
      {
        code: "scoring_conflict",
        message:
          rule === undefined
            ? `The source states a scoring rule this app does not know ("${quoted}"); the type's usual rule is used.`
            : `The source states a scoring rule this question type cannot use ("${quoted}"); the type's usual rule is used.`,
        path: ["statedScoring"],
      },
    ],
  };
}

/** Ids the converters build. Lower-case letters for options, as the fixtures and editors use. */
export const optionId = (index: number): string => `opt_${String.fromCharCode(97 + index)}`;
export const numberedId = (prefix: string, index: number): string => `${prefix}_${index + 1}`;

/** The reason a draft with no key in its source carries. */
export const needsAnswer = (message: string): DraftReason => ({ code: "needs_answer", message });

export const needsFix = (message: string, path?: (string | number)[]): DraftReason => ({
  code: "needs_fix",
  message,
  ...(path ? { path } : {}),
});

/** The options' text with marks removed, and the positions the source keyed. */
export interface OptionKeys {
  labels: string[];
  /** Keyed positions, in the order the key gives them; undefined when the source has no key. */
  keys: number[] | undefined;
  reasons: DraftReason[];
}

/**
 * Reads the key of an option list from the options' own marks and from a key printed apart
 * (`answer`). When both are there they must agree; a key that names no option is never guessed at.
 */
export function readOptionKeys(
  options: readonly { text: string }[],
  answer: string | undefined,
): OptionKeys {
  const read = options.map((option) => readMarked(option.text));
  const labels = read.map((option) => option.text);
  const marked = read.flatMap((option, index) => (option.marked ? [index] : []));
  if (answer === undefined || answer.trim() === "") {
    return { labels, keys: marked.length > 0 ? marked : undefined, reasons: [] };
  }
  const printed = parseAnswer(answer, labels);
  if (printed === undefined) {
    return {
      labels,
      keys: undefined,
      reasons: [
        needsFix(`The key in the source ("${answer.trim()}") does not name one of the options.`, [
          "answer",
        ]),
      ],
    };
  }
  const agrees =
    marked.length === 0 ||
    (new Set(printed).size === marked.length && marked.every((index) => printed.includes(index)));
  return {
    labels,
    keys: printed,
    reasons: agrees
      ? []
      : [needsFix("The options' marks and the key printed in the source disagree.", ["answer"])],
  };
}
