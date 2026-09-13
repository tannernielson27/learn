import { storedCjmmStepOf } from "./storedValues";
import { recordFormOf, recordInputOf, storedRecordFormOf, type EhrFormValues } from "./ehr";
import {
  multipleResponseItemSchema,
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

type MultipleResponseItem = ItemOf<"multiple_response">;

export interface MultipleResponseOptionForm {
  id: string;
  label: string;
  /** Marked as a correct answer. */
  correct: boolean;
  /** Why this option is right or wrong; blank means none. */
  rationale: string;
}

export interface MultipleResponseFormValues {
  id: string;
  version: number;
  tags: string[];
  cjmmStep?: MultipleResponseItem["cjmmStep"];
  difficulty?: MultipleResponseItem["difficulty"];
  ehr?: EhrFormValues;
  meta: MultipleResponseItem["meta"];
  stem: string;
  instructions: string;
  /** "Select all that apply" or "Select N". */
  variant: "sata" | "select_n";
  /** Used only when the variant is Select N. Null while the author has the field blank. */
  n: number | null;
  options: MultipleResponseOptionForm[];
  rationaleGeneral: string;
}

const DEFAULT_SELECT_N = 2;
const markdown = (value: string): RichText => ({ kind: "markdown", value });
const blank = (value: string) => value.trim().length === 0;

export function toMultipleResponseForm(item: MultipleResponseItem): MultipleResponseFormValues {
  const perElement = item.rationale.perElement ?? {};
  const correct = new Set(item.answerKey.correctOptionIds);
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
    variant: item.content.variant,
    n: item.content.n ?? DEFAULT_SELECT_N,
    options: item.content.options.map((option) => ({
      id: option.id,
      label: option.label,
      correct: correct.has(option.id),
      rationale: perElement[option.id]?.value ?? "",
    })),
    rationaleGeneral: item.rationale.general?.value ?? "",
  };
}

/**
 * Builds item input from the form. Scoring is +/-, worth one point per correct option, so it is
 * derived here rather than edited. The result is validated by the schema, not trusted.
 */
export function fromMultipleResponseForm(
  values: MultipleResponseFormValues,
): ItemInputOf<"multiple_response"> {
  const correctOptionIds = values.options
    .filter((option) => option.correct)
    .map((option) => option.id);
  const perElement = Object.fromEntries(
    values.options
      .filter((option) => !blank(option.rationale))
      .map((option) => [option.id, markdown(option.rationale)]),
  );

  return {
    id: values.id,
    type: "multiple_response",
    version: values.version,
    tags: [...values.tags],
    ...(values.cjmmStep !== undefined ? { cjmmStep: values.cjmmStep } : {}),
    ...(values.difficulty !== undefined ? { difficulty: values.difficulty } : {}),
    ...recordInputOf(values.ehr),
    stem: markdown(values.stem),
    ...(blank(values.instructions) ? {} : { instructions: values.instructions }),
    content: {
      variant: values.variant,
      // A blank count is left out, so the schema reports it as missing.
      ...(values.variant === "select_n" && values.n !== null ? { n: values.n } : {}),
      options: values.options.map(({ id, label }) => ({ id, label })),
    },
    answerKey: { correctOptionIds },
    scoring: { model: "plus_minus", maxPoints: Math.max(1, correctOptionIds.length) },
    rationale: {
      ...(blank(values.rationaleGeneral) ? {} : { general: markdown(values.rationaleGeneral) }),
      ...(Object.keys(perElement).length > 0 ? { perElement } : {}),
    },
    meta: { ...values.meta },
  };
}

/** A new item: Select all that apply, five blank unmarked options. Invalid until filled in. */
export function emptyMultipleResponseForm(id: string): MultipleResponseFormValues {
  return {
    id,
    version: 1,
    tags: [],
    meta: {},
    stem: "",
    instructions: "Select all that apply.",
    variant: "sata",
    n: DEFAULT_SELECT_N,
    options: ["opt_a", "opt_b", "opt_c", "opt_d", "opt_e"].map((optionId) => ({
      id: optionId,
      label: "",
      correct: false,
      rationale: "",
    })),
    rationaleGeneral: "",
  };
}

const MAX_OPTIONS = 10;

/**
 * Opens whatever is stored for a multiple response item. A complete item maps exactly; a draft
 * keeps its well-formed pieces, including which options are marked, and starts the rest blank.
 * Never throws: stored JSON is external input.
 */
export function multipleResponseFormFromStored(
  stored: unknown,
  rowId: string,
): MultipleResponseFormValues {
  const parsed = multipleResponseItemSchema.safeParse(stored);
  if (parsed.success) return toMultipleResponseForm(parsed.data);

  const blankForm = emptyMultipleResponseForm(rowId);
  if (!isRecord(stored)) return blankForm;

  const content = isRecord(stored.content) ? stored.content : {};
  const answerKey = isRecord(stored.answerKey) ? stored.answerKey : {};
  const rationale = isRecord(stored.rationale) ? stored.rationale : {};
  const perElement = isRecord(rationale.perElement) ? rationale.perElement : {};
  const correct = new Set(storedStrings(answerKey.correctOptionIds));

  const options = storedRecordsWithId(content.options, MAX_OPTIONS).map((option) => ({
    id: option.id,
    label: storedString(option.label),
    correct: correct.has(option.id),
    rationale: markdownText(perElement[option.id]),
  }));

  return {
    ...blankForm,
    id: storedId(stored.id, rowId),
    version: storedVersion(stored.version),
    ...storedRecordFormOf(stored),
    ...storedCjmmStepOf(stored),
    tags: storedStrings(stored.tags),
    stem: markdownText(stored.stem),
    instructions: storedString(stored.instructions, blankForm.instructions),
    variant: content.variant === "select_n" ? "select_n" : "sata",
    n:
      typeof content.n === "number" && Number.isInteger(content.n) && content.n >= 1
        ? content.n
        : blankForm.n,
    options: options.length > 0 ? options : blankForm.options,
    rationaleGeneral: markdownText(rationale.general),
  };
}
