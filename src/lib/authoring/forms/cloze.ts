import {
  dropdownClozeItemSchema,
  dropdownRationaleItemSchema,
  type ClozeToken,
  type ItemInputOf,
  type ItemOf,
  type RichText,
} from "@/lib/ngn/schemas";
import {
  isRecord,
  markdownText,
  storedId,
  storedRecordsWithId,
  storedString,
  storedStrings,
  storedVersion,
} from "./storedValues";

type DropdownClozeItem = ItemOf<"dropdown_cloze">;
type DropdownRationaleItem = ItemOf<"dropdown_rationale">;
type ClozeItem = DropdownClozeItem | DropdownRationaleItem;

export interface ClozeChoiceForm {
  id: string;
  label: string;
}

export interface ClozeBlankForm {
  id: string;
  choices: ClozeChoiceForm[];
  /** The id of the correct choice, or "" while none is chosen. */
  correctChoiceId: string;
  /** Why this blank's answer is right; blank means none. */
  rationale: string;
}

/** One form shape for drop-down cloze and drop-down rationale. */
export interface ClozeFormValues {
  id: string;
  version: number;
  tags: string[];
  cjmmStep?: ClozeItem["cjmmStep"];
  difficulty?: ClozeItem["difficulty"];
  ehr?: ClozeItem["ehr"];
  meta: ClozeItem["meta"];
  stem: string;
  instructions: string;
  /** The sentence as the author edits it, with each blank written as {{blankId}}. */
  sentence: string;
  blanks: ClozeBlankForm[];
  /** Drop-down rationale triads only: the blank the other two support. "" when unused. */
  anchorBlankId: string;
  rationaleGeneral: string;
}

// Only a well-formed id makes a marker; "{{not an id}}" stays plain text.
const MARKER = /\{\{([A-Za-z0-9_-]{1,64})\}\}/g;

const markdown = (value: string): RichText => ({ kind: "markdown", value });
const blank = (value: string) => value.trim().length === 0;

export function tokensToSentence(tokens: readonly ClozeToken[]): string {
  return tokens
    .map((token) => (token.kind === "text" ? token.value : `{{${token.blankId}}}`))
    .join("");
}

/** Splits a marked sentence into text and blank tokens, never producing an empty text token. */
export function sentenceToTokens(sentence: string): ClozeToken[] {
  const tokens: ClozeToken[] = [];
  let last = 0;
  for (const match of sentence.matchAll(MARKER)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ kind: "text", value: sentence.slice(last, index) });
    tokens.push({ kind: "blank", blankId: match[1] });
    last = index + match[0].length;
  }
  if (last < sentence.length) tokens.push({ kind: "text", value: sentence.slice(last) });
  return tokens;
}

export function toClozeForm(item: ClozeItem): ClozeFormValues {
  const perElement = item.rationale.perElement ?? {};
  const correctByBlank = new Map(
    item.answerKey.blanks.map((key) => [key.blankId, key.correctChoiceId]),
  );
  return {
    id: item.id,
    version: item.version,
    tags: [...item.tags],
    cjmmStep: item.cjmmStep,
    difficulty: item.difficulty,
    ehr: item.ehr,
    meta: { ...item.meta },
    stem: item.stem.value,
    instructions: item.instructions ?? "",
    sentence: tokensToSentence(item.content.tokens),
    blanks: item.content.blanks.map((entry) => ({
      id: entry.id,
      choices: entry.choices.map(({ id, label }) => ({ id, label })),
      correctChoiceId: correctByBlank.get(entry.id) ?? "",
      rationale: perElement[entry.id]?.value ?? "",
    })),
    anchorBlankId: item.type === "dropdown_rationale" ? (item.answerKey.anchorBlankId ?? "") : "",
    rationaleGeneral: item.rationale.general?.value ?? "",
  };
}

/** The parts both types share: everything except type, answer key and scoring. */
function envelope(values: ClozeFormValues) {
  const perElement = Object.fromEntries(
    values.blanks
      .filter((entry) => !blank(entry.rationale))
      .map((entry) => [entry.id, markdown(entry.rationale)]),
  );
  return {
    id: values.id,
    version: values.version,
    tags: [...values.tags],
    ...(values.cjmmStep !== undefined ? { cjmmStep: values.cjmmStep } : {}),
    ...(values.difficulty !== undefined ? { difficulty: values.difficulty } : {}),
    ...(values.ehr !== undefined ? { ehr: values.ehr } : {}),
    stem: markdown(values.stem),
    ...(blank(values.instructions) ? {} : { instructions: values.instructions }),
    content: {
      tokens: sentenceToTokens(values.sentence),
      blanks: values.blanks.map((entry) => ({
        id: entry.id,
        choices: entry.choices.map(({ id, label }) => ({ id, label })),
      })),
    },
    rationale: {
      ...(blank(values.rationaleGeneral) ? {} : { general: markdown(values.rationaleGeneral) }),
      ...(Object.keys(perElement).length > 0 ? { perElement } : {}),
    },
    meta: { ...values.meta },
  };
}

const answerKeyBlanks = (values: ClozeFormValues) =>
  values.blanks.map((entry) => ({ blankId: entry.id, correctChoiceId: entry.correctChoiceId }));

/** Drop-down cloze: 0/1 scoring, one point per blank. */
export function fromDropdownClozeForm(values: ClozeFormValues): ItemInputOf<"dropdown_cloze"> {
  return {
    ...envelope(values),
    type: "dropdown_cloze",
    answerKey: { blanks: answerKeyBlanks(values) },
    scoring: { model: "zero_one", maxPoints: Math.max(1, values.blanks.length) },
  };
}

/**
 * Drop-down rationale: scored by the rationale rule, where a dyad is worth one point and a triad
 * two, so the maximum is one less than the number of blanks. The anchor applies to triads.
 */
export function fromDropdownRationaleForm(
  values: ClozeFormValues,
): ItemInputOf<"dropdown_rationale"> {
  return {
    ...envelope(values),
    type: "dropdown_rationale",
    answerKey: {
      blanks: answerKeyBlanks(values),
      ...(blank(values.anchorBlankId) ? {} : { anchorBlankId: values.anchorBlankId }),
    },
    scoring: { model: "rationale", maxPoints: Math.max(1, values.blanks.length - 1) },
  };
}

/** A new sentence: one blank with three blank choices, nothing chosen. Invalid until filled in. */
export function emptyClozeForm(id: string): ClozeFormValues {
  const blankId = "blank_1";
  return {
    id,
    version: 1,
    tags: [],
    meta: {},
    stem: "",
    instructions: "",
    sentence: `{{${blankId}}}`,
    blanks: [
      {
        id: blankId,
        choices: ["a", "b", "c"].map((suffix) => ({ id: `${blankId}_${suffix}`, label: "" })),
        correctChoiceId: "",
        rationale: "",
      },
    ],
    anchorBlankId: "",
    rationaleGeneral: "",
  };
}

// The schemas' maximums: 3 blanks, 5 choices in each.
const MAX_BLANKS = 3;
const MAX_CHOICES = 5;

/** Well-formed tokens only: text with a string value, blanks with a string id. */
function storedTokens(value: unknown): ClozeToken[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((token): ClozeToken[] => {
    if (token.kind === "text" && typeof token.value === "string") {
      return [{ kind: "text", value: token.value }];
    }
    if (token.kind === "blank" && typeof token.blankId === "string") {
      return [{ kind: "blank", blankId: token.blankId }];
    }
    return [];
  });
}

/**
 * Opens whatever is stored for drop-down cloze or rationale. A complete item maps exactly; a draft
 * keeps its well-formed sentence, blanks, choices, answers and anchor, and starts the rest blank.
 * Never throws.
 */
export function clozeFormFromStored(stored: unknown, rowId: string): ClozeFormValues {
  const cloze = dropdownClozeItemSchema.safeParse(stored);
  if (cloze.success) return toClozeForm(cloze.data);
  const rationaleItem = dropdownRationaleItemSchema.safeParse(stored);
  if (rationaleItem.success) return toClozeForm(rationaleItem.data);

  const blankForm = emptyClozeForm(rowId);
  if (!isRecord(stored)) return blankForm;

  const content = isRecord(stored.content) ? stored.content : {};
  const answerKey = isRecord(stored.answerKey) ? stored.answerKey : {};
  const rationale = isRecord(stored.rationale) ? stored.rationale : {};
  const perElement = isRecord(rationale.perElement) ? rationale.perElement : {};

  const correctByBlank = new Map<string, string>();
  if (Array.isArray(answerKey.blanks)) {
    for (const key of answerKey.blanks) {
      if (
        isRecord(key) &&
        typeof key.blankId === "string" &&
        typeof key.correctChoiceId === "string"
      ) {
        correctByBlank.set(key.blankId, key.correctChoiceId);
      }
    }
  }

  const blanks = storedRecordsWithId(content.blanks, MAX_BLANKS).map((entry) => ({
    id: entry.id,
    choices: storedRecordsWithId(entry.choices, MAX_CHOICES).map((choice) => ({
      id: choice.id,
      label: storedString(choice.label),
    })),
    correctChoiceId: correctByBlank.get(entry.id) ?? "",
    rationale: markdownText(perElement[entry.id]),
  }));
  const tokens = storedTokens(content.tokens);

  return {
    ...blankForm,
    id: storedId(stored.id, rowId),
    version: storedVersion(stored.version),
    tags: storedStrings(stored.tags),
    stem: markdownText(stored.stem),
    instructions: storedString(stored.instructions),
    sentence: tokens.length > 0 ? tokensToSentence(tokens) : blankForm.sentence,
    blanks: blanks.length > 0 ? blanks : blankForm.blanks,
    anchorBlankId: storedString(answerKey.anchorBlankId),
    rationaleGeneral: markdownText(rationale.general),
  };
}
