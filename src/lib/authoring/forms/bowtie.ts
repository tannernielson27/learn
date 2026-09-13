import { bowtieItemSchema, type ItemInputOf, type ItemOf, type RichText } from "@/lib/ngn/schemas";
import {
  isRecord,
  markdownText,
  storedId,
  storedRecordsWithId,
  storedString,
  storedStrings,
  storedVersion,
} from "./storedValues";

type BowtieItem = ItemOf<"bowtie">;

export interface BowtieChoiceForm {
  id: string;
  label: string;
  /** Actions and parameters only: whether this choice is one of the two correct ones. */
  correct: boolean;
}

export interface BowtieFormValues {
  id: string;
  version: number;
  tags: string[];
  cjmmStep?: BowtieItem["cjmmStep"];
  difficulty?: BowtieItem["difficulty"];
  ehr?: BowtieItem["ehr"];
  meta: BowtieItem["meta"];
  stem: string;
  instructions: string;
  /** Always five actions, four conditions and five parameters, as the format requires. */
  actions: BowtieChoiceForm[];
  conditions: { id: string; label: string }[];
  /** The one correct condition, or "" while none is chosen. */
  conditionId: string;
  parameters: BowtieChoiceForm[];
  columnLabels: { actions: string; condition: string; parameters: string };
  rationaleGeneral: string;
}

export const BOWTIE_COUNTS = { actions: 5, conditions: 4, parameters: 5 } as const;
export const BOWTIE_DEFAULT_LABELS = {
  actions: "Actions to Take",
  condition: "Potential Condition",
  parameters: "Parameters to Monitor",
} as const;

const markdown = (value: string): RichText => ({ kind: "markdown", value });
const blank = (value: string) => value.trim().length === 0;

export function toBowtieForm(item: BowtieItem): BowtieFormValues {
  const correctActions = new Set(item.answerKey.actionIds);
  const correctParameters = new Set(item.answerKey.parameterIds);
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
    actions: item.content.actions.map(({ id, label }) => ({
      id,
      label,
      correct: correctActions.has(id),
    })),
    conditions: item.content.conditions.map(({ id, label }) => ({ id, label })),
    conditionId: item.answerKey.conditionId,
    parameters: item.content.parameters.map(({ id, label }) => ({
      id,
      label,
      correct: correctParameters.has(id),
    })),
    columnLabels: { ...item.content.labels },
    rationaleGeneral: item.rationale.general?.value ?? "",
  };
}

/** A bowtie is 0/1 per slot: two actions, one condition, two parameters, so five points. */
export function fromBowtieForm(values: BowtieFormValues): ItemInputOf<"bowtie"> {
  const choices = (list: readonly BowtieChoiceForm[]) =>
    list.map(({ id, label }) => ({ id, label }));
  return {
    id: values.id,
    version: values.version,
    tags: [...values.tags],
    ...(values.cjmmStep !== undefined ? { cjmmStep: values.cjmmStep } : {}),
    ...(values.difficulty !== undefined ? { difficulty: values.difficulty } : {}),
    ...(values.ehr !== undefined ? { ehr: values.ehr } : {}),
    type: "bowtie",
    stem: markdown(values.stem),
    ...(blank(values.instructions) ? {} : { instructions: values.instructions }),
    content: {
      actions: choices(values.actions),
      conditions: values.conditions.map(({ id, label }) => ({ id, label })),
      parameters: choices(values.parameters),
      labels: { ...values.columnLabels },
    },
    answerKey: {
      actionIds: values.actions.filter((choice) => choice.correct).map((choice) => choice.id),
      conditionId: values.conditionId,
      parameterIds: values.parameters.filter((choice) => choice.correct).map((choice) => choice.id),
    },
    scoring: { model: "zero_one", maxPoints: 5 },
    rationale: blank(values.rationaleGeneral) ? {} : { general: markdown(values.rationaleGeneral) },
    meta: { ...values.meta },
  };
}

/** Five, four and five empty choices with nothing marked. Invalid until filled in. */
export function emptyBowtieForm(id: string): BowtieFormValues {
  const list = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: `${prefix}_${index + 1}`, label: "" }));
  return {
    id,
    version: 1,
    tags: [],
    meta: {},
    stem: "",
    instructions: "",
    actions: list("action", BOWTIE_COUNTS.actions).map((choice) => ({ ...choice, correct: false })),
    conditions: list("condition", BOWTIE_COUNTS.conditions),
    conditionId: "",
    parameters: list("parameter", BOWTIE_COUNTS.parameters).map((choice) => ({
      ...choice,
      correct: false,
    })),
    columnLabels: { ...BOWTIE_DEFAULT_LABELS },
    rationaleGeneral: "",
  };
}

/** Stored choices padded or trimmed to the column's fixed count, keeping well-formed ones. */
function storedColumn(
  value: unknown,
  count: number,
  fallback: readonly { id: string; label: string }[],
): { id: string; label: string }[] {
  const stored = storedRecordsWithId(value, count).map((choice) => ({
    id: choice.id,
    label: storedString(choice.label),
  }));
  const taken = new Set(stored.map((choice) => choice.id));
  const padding = fallback.filter((choice) => !taken.has(choice.id));
  return [...stored, ...padding].slice(0, count);
}

/**
 * Every choice id unique across the three columns. A stored draft can repeat one (the format
 * refuses that, and authors cannot see or edit ids), so the first use keeps it and each repeat
 * gets a fresh id; otherwise the reopened draft could never become valid.
 */
function uniqueAcrossColumns<T extends { id: string }>(
  columns: readonly { prefix: string; choices: readonly T[] }[],
): T[][] {
  const used = new Set(columns.flatMap((column) => column.choices.map((choice) => choice.id)));
  const seen = new Set<string>();
  return columns.map(({ prefix, choices }) =>
    choices.map((choice) => {
      if (!seen.has(choice.id)) {
        seen.add(choice.id);
        return choice;
      }
      let n = 1;
      while (used.has(`${prefix}_${n}`)) n += 1;
      const id = `${prefix}_${n}`;
      used.add(id);
      seen.add(id);
      return { ...choice, id };
    }),
  );
}

/** Opens whatever is stored for a bowtie. Never throws. */
export function bowtieFormFromStored(stored: unknown, rowId: string): BowtieFormValues {
  const item = bowtieItemSchema.safeParse(stored);
  if (item.success) return toBowtieForm(item.data);
  const blankForm = emptyBowtieForm(rowId);
  if (!isRecord(stored)) return blankForm;
  const content = isRecord(stored.content) ? stored.content : {};
  const answerKey = isRecord(stored.answerKey) ? stored.answerKey : {};
  const rationale = isRecord(stored.rationale) ? stored.rationale : {};
  const labels = isRecord(content.labels) ? content.labels : {};
  const correctActions = new Set(storedStrings(answerKey.actionIds));
  const correctParameters = new Set(storedStrings(answerKey.parameterIds));
  // Marks are applied after ids are made unique, so only a choice's first use keeps its mark.
  const [actions, conditions, parameters] = uniqueAcrossColumns([
    {
      prefix: "action",
      choices: storedColumn(content.actions, BOWTIE_COUNTS.actions, blankForm.actions),
    },
    {
      prefix: "condition",
      choices: storedColumn(content.conditions, BOWTIE_COUNTS.conditions, blankForm.conditions),
    },
    {
      prefix: "parameter",
      choices: storedColumn(content.parameters, BOWTIE_COUNTS.parameters, blankForm.parameters),
    },
  ]);
  const firstIndexOf = (list: readonly { id: string }[], id: string) =>
    list.findIndex((choice) => choice.id === id);

  return {
    ...blankForm,
    id: storedId(stored.id, rowId),
    version: storedVersion(stored.version),
    tags: storedStrings(stored.tags),
    stem: markdownText(stored.stem),
    instructions: storedString(stored.instructions),
    actions: actions.map((choice, index) => ({
      ...choice,
      correct: correctActions.has(choice.id) && firstIndexOf(actions, choice.id) === index,
    })),
    conditions,
    conditionId: storedString(answerKey.conditionId),
    parameters: parameters.map((choice, index) => ({
      ...choice,
      correct: correctParameters.has(choice.id) && firstIndexOf(parameters, choice.id) === index,
    })),
    columnLabels: {
      actions: storedString(labels.actions, BOWTIE_DEFAULT_LABELS.actions),
      condition: storedString(labels.condition, BOWTIE_DEFAULT_LABELS.condition),
      parameters: storedString(labels.parameters, BOWTIE_DEFAULT_LABELS.parameters),
    },
    rationaleGeneral: markdownText(rationale.general),
  };
}
