import { recordFormOf, recordInputOf, storedRecordFormOf, type EhrFormValues } from "./ehr";
import {
  dragdropClozeItemSchema,
  dragdropRationaleItemSchema,
  type ClozeToken,
  type ItemInputOf,
  type ItemOf,
  type RichText,
} from "@/lib/ngn/schemas";
import { sentenceToTokens, tokensToSentence } from "./cloze";
import {
  isRecord,
  markdownText,
  storedId,
  storedRecordsWithId,
  storedString,
  storedStrings,
  storedVersion,
} from "./storedValues";

type DragdropItem = ItemOf<"dragdrop_cloze"> | ItemOf<"dragdrop_rationale">;

export interface DragDropBlankForm {
  id: string;
  /** The bank token that fills this blank, or "" while none is chosen. */
  correctTokenId: string;
  rationale: string;
}

/** One form shape for drag-and-drop cloze and drag-and-drop rationale. */
export interface DragDropFormValues {
  id: string;
  version: number;
  tags: string[];
  cjmmStep?: DragdropItem["cjmmStep"];
  difficulty?: DragdropItem["difficulty"];
  ehr?: EhrFormValues;
  meta: DragdropItem["meta"];
  stem: string;
  instructions: string;
  /** The sentence with each blank written as {{blankId}}, as in the drop-down cloze editor. */
  sentence: string;
  blanks: DragDropBlankForm[];
  bank: { id: string; label: string }[];
  /** Whether one word may fill more than one blank. */
  reusable: boolean;
  /** Rationale triads only: the blank the others support. "" when unused. */
  anchorBlankId: string;
  rationaleGeneral: string;
}

const markdown = (value: string): RichText => ({ kind: "markdown", value });
const blank = (value: string) => value.trim().length === 0;

export function toDragDropForm(item: DragdropItem): DragDropFormValues {
  const perElement = item.rationale.perElement ?? {};
  const correctByBlank = new Map(
    item.answerKey.blanks.map((key) => [key.blankId, key.correctTokenId]),
  );
  return {
    id: item.id,
    version: item.version,
    tags: [...item.tags],
    cjmmStep: item.cjmmStep,
    difficulty: item.difficulty,
    ...recordFormOf(item.ehr),
    meta: { ...item.meta },
    stem: item.stem.value,
    instructions: item.instructions ?? "",
    sentence: tokensToSentence(item.content.tokens),
    blanks: item.content.blanks.map((entry) => ({
      id: entry.id,
      correctTokenId: correctByBlank.get(entry.id) ?? "",
      rationale: perElement[entry.id]?.value ?? "",
    })),
    bank: item.content.bank.map(({ id, label }) => ({ id, label })),
    reusable: item.content.reusable,
    anchorBlankId: item.type === "dragdrop_rationale" ? (item.answerKey.anchorBlankId ?? "") : "",
    rationaleGeneral: item.rationale.general?.value ?? "",
  };
}

function envelope(values: DragDropFormValues) {
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
    ...recordInputOf(values.ehr),
    stem: markdown(values.stem),
    ...(blank(values.instructions) ? {} : { instructions: values.instructions }),
    content: {
      tokens: sentenceToTokens(values.sentence),
      blanks: values.blanks.map((entry) => ({ id: entry.id })),
      bank: values.bank.map(({ id, label }) => ({ id, label })),
      reusable: values.reusable,
    },
    rationale: {
      ...(blank(values.rationaleGeneral) ? {} : { general: markdown(values.rationaleGeneral) }),
      ...(Object.keys(perElement).length > 0 ? { perElement } : {}),
    },
    meta: { ...values.meta },
  };
}

const keyBlanks = (values: DragDropFormValues) =>
  values.blanks.map((entry) => ({ blankId: entry.id, correctTokenId: entry.correctTokenId }));

/** Drag-and-drop cloze: 0/1 per blank. */
export function fromDragdropClozeForm(values: DragDropFormValues): ItemInputOf<"dragdrop_cloze"> {
  return {
    ...envelope(values),
    type: "dragdrop_cloze",
    answerKey: { blanks: keyBlanks(values) },
    scoring: { model: "zero_one", maxPoints: Math.max(1, values.blanks.length) },
  };
}

/** Drag-and-drop rationale: a dyad is worth one point and a triad two. */
export function fromDragdropRationaleForm(
  values: DragDropFormValues,
): ItemInputOf<"dragdrop_rationale"> {
  return {
    ...envelope(values),
    type: "dragdrop_rationale",
    answerKey: {
      blanks: keyBlanks(values),
      ...(blank(values.anchorBlankId) ? {} : { anchorBlankId: values.anchorBlankId }),
    },
    scoring: { model: "rationale", maxPoints: Math.max(1, values.blanks.length - 1) },
  };
}

/** One blank and four empty words, nothing chosen. Invalid until filled in. */
export function emptyDragDropForm(id: string): DragDropFormValues {
  return {
    id,
    version: 1,
    tags: [],
    meta: {},
    stem: "",
    instructions: "",
    sentence: "{{blank_1}}",
    blanks: [{ id: "blank_1", correctTokenId: "", rationale: "" }],
    bank: [1, 2, 3, 4].map((n) => ({ id: `tok_${n}`, label: "" })),
    reusable: false,
    anchorBlankId: "",
    rationaleGeneral: "",
  };
}

// The schemas' maximums: 3 blanks, 8 words.
const MAX_BLANKS = 3;
const MAX_BANK = 8;

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

/** Opens whatever is stored for either drag-and-drop type. Never throws. */
export function dragDropFormFromStored(stored: unknown, rowId: string): DragDropFormValues {
  const cloze = dragdropClozeItemSchema.safeParse(stored);
  if (cloze.success) return toDragDropForm(cloze.data);
  const rationaleItem = dragdropRationaleItemSchema.safeParse(stored);
  if (rationaleItem.success) return toDragDropForm(rationaleItem.data);

  const blankForm = emptyDragDropForm(rowId);
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
        typeof key.correctTokenId === "string"
      ) {
        correctByBlank.set(key.blankId, key.correctTokenId);
      }
    }
  }
  const blanks = storedRecordsWithId(content.blanks, MAX_BLANKS).map((entry) => ({
    id: entry.id,
    correctTokenId: correctByBlank.get(entry.id) ?? "",
    rationale: markdownText(perElement[entry.id]),
  }));
  const bank = storedRecordsWithId(content.bank, MAX_BANK).map((token) => ({
    id: token.id,
    label: storedString(token.label),
  }));
  const tokens = storedTokens(content.tokens);

  return {
    ...blankForm,
    id: storedId(stored.id, rowId),
    version: storedVersion(stored.version),
    ...storedRecordFormOf(stored),
    tags: storedStrings(stored.tags),
    stem: markdownText(stored.stem),
    instructions: storedString(stored.instructions),
    sentence: tokens.length > 0 ? tokensToSentence(tokens) : blankForm.sentence,
    blanks: blanks.length > 0 ? blanks : blankForm.blanks,
    bank: bank.length > 0 ? bank : blankForm.bank,
    reusable: content.reusable === true,
    anchorBlankId: storedString(answerKey.anchorBlankId),
    rationaleGeneral: markdownText(rationale.general),
  };
}
