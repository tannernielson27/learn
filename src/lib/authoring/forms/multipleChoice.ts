import {
  multipleChoiceItemSchema,
  type ItemInputOf,
  type ItemOf,
  type RichText,
} from "@/lib/ngn/schemas";

type MultipleChoiceItem = ItemOf<"multiple_choice">;

export interface MultipleChoiceOptionForm {
  id: string;
  label: string;
  /** Why this option is right or wrong; blank means none. */
  rationale: string;
}

/**
 * What the editor form holds. Markdown fields are plain strings here; everything the form does
 * not edit (id, version, tags, CJMM step, difficulty, record, meta) is carried through untouched.
 */
export interface MultipleChoiceFormValues {
  id: string;
  version: number;
  tags: string[];
  cjmmStep?: MultipleChoiceItem["cjmmStep"];
  difficulty?: MultipleChoiceItem["difficulty"];
  ehr?: MultipleChoiceItem["ehr"];
  meta: MultipleChoiceItem["meta"];
  stem: string;
  instructions: string;
  options: MultipleChoiceOptionForm[];
  correctOptionId: string;
  rationaleGeneral: string;
}

const markdown = (value: string): RichText => ({ kind: "markdown", value });
const blank = (value: string) => value.trim().length === 0;

export function toMultipleChoiceForm(item: MultipleChoiceItem): MultipleChoiceFormValues {
  const perElement = item.rationale.perElement ?? {};
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
    options: item.content.options.map((option) => ({
      id: option.id,
      label: option.label,
      rationale: perElement[option.id]?.value ?? "",
    })),
    correctOptionId: item.answerKey.correctOptionId,
    rationaleGeneral: item.rationale.general?.value ?? "",
  };
}

/** Builds item input from the form. The result is validated by the schema, not trusted. */
export function fromMultipleChoiceForm(
  values: MultipleChoiceFormValues,
): ItemInputOf<"multiple_choice"> {
  const perElement = Object.fromEntries(
    values.options
      .filter((option) => !blank(option.rationale))
      .map((option) => [option.id, markdown(option.rationale)]),
  );

  return {
    id: values.id,
    type: "multiple_choice",
    version: values.version,
    tags: [...values.tags],
    ...(values.cjmmStep !== undefined ? { cjmmStep: values.cjmmStep } : {}),
    ...(values.difficulty !== undefined ? { difficulty: values.difficulty } : {}),
    ...(values.ehr !== undefined ? { ehr: values.ehr } : {}),
    stem: markdown(values.stem),
    ...(blank(values.instructions) ? {} : { instructions: values.instructions }),
    content: { options: values.options.map(({ id, label }) => ({ id, label })) },
    answerKey: { correctOptionId: values.correctOptionId },
    scoring: { model: "zero_one", maxPoints: 1 },
    rationale: {
      ...(blank(values.rationaleGeneral) ? {} : { general: markdown(values.rationaleGeneral) }),
      ...(Object.keys(perElement).length > 0 ? { perElement } : {}),
    },
    meta: { ...values.meta },
  };
}

/** A new item: four blank options, nothing marked correct. Invalid until the author fills it in. */
export function emptyMultipleChoiceForm(id: string): MultipleChoiceFormValues {
  return {
    id,
    version: 1,
    tags: [],
    meta: {},
    stem: "",
    instructions: "",
    options: ["opt_a", "opt_b", "opt_c", "opt_d"].map((optionId) => ({
      id: optionId,
      label: "",
      rationale: "",
    })),
    correctOptionId: "",
    rationaleGeneral: "",
  };
}

const MAX_STORED_OPTIONS = 6;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const markdownText = (value: unknown): string =>
  isRecord(value) && typeof value.value === "string" ? value.value : "";

/**
 * Opens whatever is stored for an item. A complete item maps exactly; a draft (possibly just
 * created, possibly half written) keeps the pieces that are well formed and starts the rest
 * blank. Never throws: stored JSON is external input.
 */
export function multipleChoiceFormFromStored(
  stored: unknown,
  rowId: string,
): MultipleChoiceFormValues {
  const parsed = multipleChoiceItemSchema.safeParse(stored);
  if (parsed.success) return toMultipleChoiceForm(parsed.data);

  const blankForm = emptyMultipleChoiceForm(rowId);
  if (!isRecord(stored)) return blankForm;

  const content = isRecord(stored.content) ? stored.content : {};
  const answerKey = isRecord(stored.answerKey) ? stored.answerKey : {};
  const rationale = isRecord(stored.rationale) ? stored.rationale : {};
  const perElement = isRecord(rationale.perElement) ? rationale.perElement : {};

  const storedOptions = Array.isArray(content.options)
    ? content.options
        .filter(isRecord)
        .filter((option) => typeof option.id === "string")
        .slice(0, MAX_STORED_OPTIONS)
        .map((option) => ({
          id: option.id as string,
          label: typeof option.label === "string" ? option.label : "",
          rationale: markdownText(perElement[option.id as string]),
        }))
    : [];

  return {
    ...blankForm,
    id: typeof stored.id === "string" && stored.id.length > 0 ? stored.id : rowId,
    version:
      typeof stored.version === "number" && Number.isInteger(stored.version) && stored.version >= 1
        ? stored.version
        : 1,
    tags: Array.isArray(stored.tags) ? stored.tags.filter((tag) => typeof tag === "string") : [],
    stem: markdownText(stored.stem),
    instructions: typeof stored.instructions === "string" ? stored.instructions : "",
    options: storedOptions.length > 0 ? storedOptions : blankForm.options,
    correctOptionId: typeof answerKey.correctOptionId === "string" ? answerKey.correctOptionId : "",
    rationaleGeneral: markdownText(rationale.general),
  };
}
