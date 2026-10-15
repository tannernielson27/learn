import { z } from "zod";
import type { ClozeToken, ItemOf } from "../schemas";
import {
  draftEnvelopeFields,
  envelopeDraftOf,
  envelopeOf,
  needsAnswer,
  needsFix,
  numberedId,
  perElementOf,
  readOptionKeys,
  resolveScoring,
  STATED_RULE_TEXT,
  type DraftContext,
  type DraftConversion,
  type DraftReason,
} from "./common";
import { onlyMarkers, readMarkers, unreadableMessage } from "./markers";
import { letterOf, parseAnswer, parseScoringRule, readMarked } from "./text";

/**
 * Drafts for the cloze family (#338): drop-down cloze and rationale, drag-and-drop cloze and
 * rationale. The sentence is copied with each blank written where it falls; the converter builds
 * the tokens, the blanks and their ids.
 */

const blankRationalesField = z
  .array(z.string())
  .optional()
  .describe(
    "The rationale the source gives for each blank, one entry per blank in the order the blanks appear, and an empty string for a blank it gives none. Copy it word for word. Leave it out when the source gives no rationale per blank. Never write one yourself.",
  );

const answersField = z
  .array(z.string())
  .optional()
  .describe(
    "A key printed apart from the sentence, one entry per blank in the order the blanks appear, copied word for word. Leave it out when the blanks carry their own marks or the source has no key. Never work out an answer yourself.",
  );

const dropdownSentence = z
  .string()
  .describe(
    "The sentence with its blanks, word for word. Write each blank where it falls as [[blank: choice | choice | choice]], listing its choices in the order the source does, and keep the source's * or check mark on a keyed choice, as in [[blank: seizure | cardiac dysrhythmia* | alkalosis]]. Never add a mark the source does not have.",
  );

const dragdropSentence = z
  .string()
  .describe(
    "The sentence with its blanks, word for word. Write each blank where it falls as [[blank]]. When the source shows which word fills a blank, write that word inside it, as in [[blank: high Fowler position]]. Never fill a blank the source leaves empty.",
  );

const dragdropBank = z
  .array(z.string())
  .describe(
    "Every word or phrase in the word bank, in the order the source lists them, word for word.",
  );

const dragdropReusable = z
  .boolean()
  .optional()
  .describe(
    "True only when the source says a word may be used more than once. Leave it out otherwise.",
  );

export const dropdownClozeDraftSchema = z.object({
  type: z.literal("dropdown_cloze"),
  ...draftEnvelopeFields,
  sentence: dropdownSentence,
  answers: answersField,
  blankRationales: blankRationalesField,
});
export type DropdownClozeDraft = z.infer<typeof dropdownClozeDraftSchema>;

export const dropdownRationaleDraftSchema = dropdownClozeDraftSchema.extend({
  type: z.literal("dropdown_rationale"),
});
export type DropdownRationaleDraft = z.infer<typeof dropdownRationaleDraftSchema>;

export const dragdropClozeDraftSchema = z.object({
  type: z.literal("dragdrop_cloze"),
  ...draftEnvelopeFields,
  sentence: dragdropSentence,
  bank: dragdropBank,
  reusable: dragdropReusable,
  answers: answersField,
  blankRationales: blankRationalesField,
});
export type DragdropClozeDraft = z.infer<typeof dragdropClozeDraftSchema>;

export const dragdropRationaleDraftSchema = dragdropClozeDraftSchema.extend({
  type: z.literal("dragdrop_rationale"),
});
export type DragdropRationaleDraft = z.infer<typeof dragdropRationaleDraftSchema>;

// ---------------------------------------------------------------------------
// Shared: the sentence, the per-blank key, the rule
// ---------------------------------------------------------------------------

interface Sentence {
  tokens: ClozeToken[];
  /** What each blank's marker held, in order; undefined for a bare `[[blank]]`. */
  inner: (string | undefined)[];
  ids: string[];
  reasons: DraftReason[];
}

function readSentence(sentence: string): Sentence {
  const prose = onlyMarkers(readMarkers(sentence), "blank");
  const ids: string[] = [];
  const inner: (string | undefined)[] = [];
  const tokens = prose.segments.map((segment): ClozeToken => {
    if (segment.kind === "text") return { kind: "text", value: segment.value };
    const id = numberedId("blank", ids.length);
    ids.push(id);
    inner.push(segment.inner);
    return { kind: "blank", blankId: id };
  });
  const reasons =
    prose.unreadable.length > 0
      ? [needsFix(unreadableMessage(prose.unreadable), ["sentence"])]
      : [];
  if (ids.length === 0) {
    reasons.push(needsFix("The sentence has no blanks marked as [[blank]].", ["sentence"]));
  }
  return { tokens, inner, ids, reasons };
}

/** The `answers` entry for each blank, or nothing when the count does not match the blanks. */
function answersPerBlank(
  answers: string[] | undefined,
  count: number,
): { answers: (string | undefined)[]; reasons: DraftReason[] } {
  if (answers === undefined || answers.length === 0) {
    return { answers: Array.from({ length: count }, () => undefined), reasons: [] };
  }
  if (answers.length === count) return { answers, reasons: [] };
  return {
    answers: Array.from({ length: count }, () => undefined),
    reasons: [
      needsFix(
        `The key printed in the source has ${answers.length} entries for ${count} blanks, so it was not used.`,
        ["answers"],
      ),
    ],
  };
}

/**
 * Turns one key position per blank (undefined for an unkeyed blank) into reasons: none keyed is
 * `needs_answer`; some keyed and some not is `needs_fix` for each one missing.
 */
function blankKeyReasons(keyed: readonly (number | undefined)[]): DraftReason[] {
  if (keyed.length === 0) return [];
  if (keyed.every((key) => key === undefined)) {
    return [
      needsAnswer("The source marks no answers. Add the key before this question can be imported."),
    ];
  }
  return keyed.flatMap((key, index) =>
    key === undefined
      ? [needsFix(`Blank ${index + 1} has no answer in the source.`, ["sentence"])]
      : [],
  );
}

function blankRationaleMap(
  ids: readonly string[],
  rationales: string[] | undefined,
): { perElement: ReturnType<typeof perElementOf>; reasons: DraftReason[] } {
  if (rationales === undefined || rationales.length === 0) return { perElement: {}, reasons: [] };
  if (rationales.length !== ids.length) {
    return {
      perElement: {},
      reasons: [
        needsFix(
          `The source's rationales per blank number ${rationales.length} for ${ids.length} blanks, so they were not used.`,
          ["blankRationales"],
        ),
      ],
    };
  }
  return {
    perElement: perElementOf(ids.map((id, index) => ({ id, rationale: rationales[index] }))),
    reasons: [],
  };
}

type ClozeFamily = "cloze" | "rationale";

/**
 * Which family a cloze draft lands in. A cloze whose source states the rationale rule over 2 or 3
 * blanks is a rationale item (the NGN sentence "…as evidenced by…" printed under "Scoring Rule:
 * Rationale"); any other stated rule the family cannot use is a `scoring_conflict`.
 */
function familyOf(
  declared: ClozeFamily,
  stated: string | undefined,
  blanks: number,
): { family: ClozeFamily; reasons: DraftReason[] } {
  const rule = stated === undefined ? undefined : parseScoringRule(stated);
  const fitsRationale = blanks === 2 || blanks === 3;
  if (declared === "cloze" && rule === "rationale" && fitsRationale) {
    return { family: "rationale", reasons: [] };
  }
  const policy =
    declared === "cloze"
      ? ({ default: "zero_one", allowed: ["zero_one"] } as const)
      : ({ default: "rationale", allowed: ["rationale"] } as const);
  return { family: declared, reasons: resolveScoring(stated, policy).reasons };
}

const maxPointsOf = (family: ClozeFamily, blanks: number): number =>
  family === "rationale" ? (blanks === 3 ? 2 : 1) : Math.max(1, blanks);

/** A triad's anchor is its first blank: the NGN sentence names the condition first. */
const anchorOf = (family: ClozeFamily, ids: readonly string[]) =>
  family === "rationale" && ids.length === 3 ? { anchorBlankId: ids[0] } : {};

// ---------------------------------------------------------------------------
// dropdown_cloze / dropdown_rationale
// ---------------------------------------------------------------------------

type DropdownType = "dropdown_cloze" | "dropdown_rationale";

function fromDropdown(
  draft: DropdownClozeDraft | DropdownRationaleDraft,
  context: DraftContext,
): DraftConversion<DropdownType> {
  const sentence = readSentence(draft.sentence);
  const printed = answersPerBlank(draft.answers, sentence.ids.length);
  const reasons: DraftReason[] = [...sentence.reasons, ...printed.reasons];
  const blanks = sentence.ids.map((id, index) => {
    const raw = sentence.inner[index];
    const choices = raw === undefined || raw === "" ? [] : raw.split("|");
    if (choices.length === 0) {
      reasons.push(needsFix(`Blank ${index + 1} lists no choices.`, ["sentence"]));
    }
    const read = readOptionKeys(
      choices.map((text) => ({ text })),
      printed.answers[index],
    );
    reasons.push(...read.reasons.map((reason) => ({ ...reason, path: ["answers", index] })));
    const keys = read.keys ?? [];
    if (keys.length > 1) {
      reasons.push(
        needsFix(`Blank ${index + 1} has ${keys.length} answers; a drop-down has one.`, [
          "sentence",
        ]),
      );
    }
    const choiceIds = read.labels.map((_, choice) => `${id}_${letterOf(choice).toLowerCase()}`);
    return {
      id,
      choices: read.labels.map((label, choice) => ({ id: choiceIds[choice], label })),
      key: keys.length === 1 ? choiceIds[keys[0]] : undefined,
      keyCount: keys.length,
    };
  });
  const declared: ClozeFamily = draft.type === "dropdown_cloze" ? "cloze" : "rationale";
  const { family, reasons: ruleReasons } = familyOf(
    declared,
    draft.statedScoring,
    sentence.ids.length,
  );
  const keyReasons = blankKeyReasons(
    blanks.map((blank) => (blank.keyCount === 0 ? undefined : blank.keyCount)),
  );
  const rationales = blankRationaleMap(sentence.ids, draft.blankRationales);
  const item = {
    ...envelopeOf(draft, context, rationales.perElement),
    content: {
      tokens: sentence.tokens,
      blanks: blanks.map(({ id, choices }) => ({ id, choices })),
    },
    answerKey: {
      blanks: blanks.flatMap(({ id, key }) =>
        key === undefined ? [] : [{ blankId: id, correctChoiceId: key }],
      ),
      ...anchorOf(family, sentence.ids),
    },
  };
  const max = maxPointsOf(family, sentence.ids.length);
  return {
    item:
      family === "rationale"
        ? { ...item, type: "dropdown_rationale", scoring: { model: "rationale", maxPoints: max } }
        : { ...item, type: "dropdown_cloze", scoring: { model: "zero_one", maxPoints: max } },
    reasons: [...reasons, ...keyReasons, ...rationales.reasons, ...ruleReasons],
  };
}

export const fromDropdownClozeDraft = (
  draft: DropdownClozeDraft,
  context: DraftContext = {},
): DraftConversion<DropdownType> => fromDropdown(draft, context);

export const fromDropdownRationaleDraft = (
  draft: DropdownRationaleDraft,
  context: DraftContext = {},
): DraftConversion<DropdownType> => fromDropdown(draft, context);

/** The sentence a cloze item's tokens print, each blank written by `blank`. */
function sentenceOf(tokens: readonly ClozeToken[], blank: (blankId: string) => string): string {
  return tokens
    .map((token) => (token.kind === "text" ? token.value : blank(token.blankId)))
    .join("");
}

function blankRationalesOf(item: ItemOf<DropdownType | DragdropType>): {
  blankRationales?: string[];
} {
  const ids = item.content.blanks.map((blank) => blank.id);
  const perElement = item.rationale.perElement ?? {};
  if (!ids.some((id) => perElement[id] !== undefined)) return {};
  return { blankRationales: ids.map((id) => perElement[id]?.value ?? "") };
}

function toDropdown<T extends DropdownType>(item: ItemOf<T>) {
  const keys = new Map(item.answerKey.blanks.map((key) => [key.blankId, key.correctChoiceId]));
  const sentence = sentenceOf(item.content.tokens, (blankId) => {
    const blank = item.content.blanks.find((candidate) => candidate.id === blankId);
    const choices = (blank?.choices ?? []).map((choice) =>
      keys.get(blankId) === choice.id ? `${choice.label}*` : choice.label,
    );
    return `[[blank: ${choices.join(" | ")}]]`;
  });
  return {
    ...envelopeDraftOf(item, STATED_RULE_TEXT[item.scoring.model]),
    sentence,
    ...blankRationalesOf(item),
  };
}

export const toDropdownClozeDraft = (item: ItemOf<"dropdown_cloze">): DropdownClozeDraft => ({
  type: "dropdown_cloze",
  ...toDropdown(item),
});

export const toDropdownRationaleDraft = (
  item: ItemOf<"dropdown_rationale">,
): DropdownRationaleDraft => ({ type: "dropdown_rationale", ...toDropdown(item) });

// ---------------------------------------------------------------------------
// dragdrop_cloze / dragdrop_rationale
// ---------------------------------------------------------------------------

type DragdropType = "dragdrop_cloze" | "dragdrop_rationale";

/** The bank position a blank's marker or printed key names, or a reason it names none. */
function bankPick(
  written: string | undefined,
  labels: readonly string[],
  blank: number,
): { index?: number; reason?: DraftReason } {
  const text = written === undefined ? "" : readMarked(written).text;
  if (text === "") return {};
  const exact = labels.findIndex((label) => label.toLowerCase() === text.toLowerCase());
  if (exact >= 0) return { index: exact };
  const picked = parseAnswer(text, labels);
  if (picked?.length === 1) return { index: picked[0] };
  return {
    reason: needsFix(
      `The answer for blank ${blank + 1} ("${text}") is not one of the words in the bank.`,
      ["sentence"],
    ),
  };
}

function fromDragdrop(
  draft: DragdropClozeDraft | DragdropRationaleDraft,
  context: DraftContext,
): DraftConversion<DragdropType> {
  const sentence = readSentence(draft.sentence);
  const printed = answersPerBlank(draft.answers, sentence.ids.length);
  const reasons: DraftReason[] = [...sentence.reasons, ...printed.reasons];
  const bank = draft.bank.map((word, index) => ({
    id: numberedId("tok", index),
    ...readMarked(word),
  }));
  const labels = bank.map((word) => word.text);
  const keyed = sentence.ids.map((_, index) => {
    const inline = bankPick(sentence.inner[index], labels, index);
    const apart = bankPick(printed.answers[index], labels, index);
    for (const pick of [inline, apart]) if (pick.reason) reasons.push(pick.reason);
    if (inline.index !== undefined && apart.index !== undefined && inline.index !== apart.index) {
      reasons.push(
        needsFix(`Blank ${index + 1}'s word and the key printed in the source disagree.`, [
          "answers",
          index,
        ]),
      );
    }
    return inline.index ?? apart.index;
  });
  const nothingKeyed = keyed.every((key) => key === undefined);
  if (nothingKeyed && bank.some((word) => word.marked)) {
    reasons.push(
      needsFix("The source marks words in the bank but not which blank each one fills.", ["bank"]),
    );
  }
  const declared: ClozeFamily = draft.type === "dragdrop_cloze" ? "cloze" : "rationale";
  const { family, reasons: ruleReasons } = familyOf(
    declared,
    draft.statedScoring,
    sentence.ids.length,
  );
  const rationales = blankRationaleMap(sentence.ids, draft.blankRationales);
  const item = {
    ...envelopeOf(draft, context, rationales.perElement),
    content: {
      tokens: sentence.tokens,
      blanks: sentence.ids.map((id) => ({ id })),
      bank: bank.map(({ id, text }) => ({ id, label: text })),
      reusable: draft.reusable === true,
    },
    answerKey: {
      blanks: sentence.ids.flatMap((id, index) => {
        const key = keyed[index];
        return key === undefined ? [] : [{ blankId: id, correctTokenId: bank[key].id }];
      }),
      ...anchorOf(family, sentence.ids),
    },
  };
  const max = maxPointsOf(family, sentence.ids.length);
  return {
    item:
      family === "rationale"
        ? { ...item, type: "dragdrop_rationale", scoring: { model: "rationale", maxPoints: max } }
        : { ...item, type: "dragdrop_cloze", scoring: { model: "zero_one", maxPoints: max } },
    reasons: [...reasons, ...blankKeyReasons(keyed), ...rationales.reasons, ...ruleReasons],
  };
}

export const fromDragdropClozeDraft = (
  draft: DragdropClozeDraft,
  context: DraftContext = {},
): DraftConversion<DragdropType> => fromDragdrop(draft, context);

export const fromDragdropRationaleDraft = (
  draft: DragdropRationaleDraft,
  context: DraftContext = {},
): DraftConversion<DragdropType> => fromDragdrop(draft, context);

function toDragdrop<T extends DragdropType>(item: ItemOf<T>) {
  const words = new Map(item.content.bank.map((word) => [word.id, word.label]));
  const keys = new Map(item.answerKey.blanks.map((key) => [key.blankId, key.correctTokenId]));
  return {
    ...envelopeDraftOf(item, STATED_RULE_TEXT[item.scoring.model]),
    sentence: sentenceOf(item.content.tokens, (blankId) => {
      const word = words.get(keys.get(blankId) ?? "");
      return word === undefined ? "[[blank]]" : `[[blank: ${word}]]`;
    }),
    bank: item.content.bank.map((word) => word.label),
    ...(item.content.reusable ? { reusable: true } : {}),
    ...blankRationalesOf(item),
  };
}

export const toDragdropClozeDraft = (item: ItemOf<"dragdrop_cloze">): DragdropClozeDraft => ({
  type: "dragdrop_cloze",
  ...toDragdrop(item),
});

export const toDragdropRationaleDraft = (
  item: ItemOf<"dragdrop_rationale">,
): DragdropRationaleDraft => ({ type: "dragdrop_rationale", ...toDragdrop(item) });
