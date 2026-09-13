import { storedCjmmStepOf } from "./storedValues";
import { recordFormOf, recordInputOf, storedRecordFormOf, type EhrFormValues } from "./ehr";
import {
  orderedResponseItemSchema,
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

type OrderedItem = ItemOf<"ordered_response">;

export interface OrderedStepForm {
  id: string;
  label: string;
  /** Why this step belongs in its place; blank means none. */
  rationale: string;
}

export interface OrderedResponseFormValues {
  id: string;
  version: number;
  tags: string[];
  cjmmStep?: OrderedItem["cjmmStep"];
  difficulty?: OrderedItem["difficulty"];
  ehr?: EhrFormValues;
  meta: OrderedItem["meta"];
  stem: string;
  instructions: string;
  /** The steps in their correct order: the order here is the answer key. */
  steps: OrderedStepForm[];
  /** Score a point for each step in the right place, instead of one point for the exact order. */
  partialByPosition: boolean;
  rationaleGeneral: string;
}

const markdown = (value: string): RichText => ({ kind: "markdown", value });
const blank = (value: string) => value.trim().length === 0;

export function toOrderedResponseForm(item: OrderedItem): OrderedResponseFormValues {
  const perElement = item.rationale.perElement ?? {};
  const labels = new Map(item.content.items.map((step) => [step.id, step.label]));
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
    steps: item.answerKey.orderedIds.map((id) => ({
      id,
      label: labels.get(id) ?? "",
      rationale: perElement[id]?.value ?? "",
    })),
    partialByPosition: item.content.partial === "position",
    rationaleGeneral: item.rationale.general?.value ?? "",
  };
}

/**
 * The steps are written in their correct order, which becomes the key. The player shuffles what
 * students see (presentationOrder), so content keeps the authored order.
 */
export function fromOrderedResponseForm(
  values: OrderedResponseFormValues,
): ItemInputOf<"ordered_response"> {
  const perElement = Object.fromEntries(
    values.steps
      .filter((step) => !blank(step.rationale))
      .map((step) => [step.id, markdown(step.rationale)]),
  );
  return {
    id: values.id,
    version: values.version,
    tags: [...values.tags],
    ...(values.cjmmStep !== undefined ? { cjmmStep: values.cjmmStep } : {}),
    ...(values.difficulty !== undefined ? { difficulty: values.difficulty } : {}),
    ...recordInputOf(values.ehr),
    type: "ordered_response",
    stem: markdown(values.stem),
    ...(blank(values.instructions) ? {} : { instructions: values.instructions }),
    content: {
      items: values.steps.map(({ id, label }) => ({ id, label })),
      ...(values.partialByPosition ? { partial: "position" as const } : {}),
    },
    answerKey: { orderedIds: values.steps.map((step) => step.id) },
    scoring: {
      model: "zero_one",
      maxPoints: values.partialByPosition ? Math.max(1, values.steps.length) : 1,
    },
    rationale: {
      ...(blank(values.rationaleGeneral) ? {} : { general: markdown(values.rationaleGeneral) }),
      ...(Object.keys(perElement).length > 0 ? { perElement } : {}),
    },
    meta: { ...values.meta },
  };
}

/** Four empty steps. Invalid until each has text. */
export function emptyOrderedResponseForm(id: string): OrderedResponseFormValues {
  return {
    id,
    version: 1,
    tags: [],
    meta: {},
    stem: "",
    instructions: "",
    steps: [1, 2, 3, 4].map((n) => ({ id: `step_${n}`, label: "", rationale: "" })),
    partialByPosition: false,
    rationaleGeneral: "",
  };
}

/** A new order with one step moved by `offset` places; out-of-range moves change nothing. */
export function moveStep<T>(steps: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) {
    return [...steps];
  }
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const MAX_STEPS = 6;

/** Opens whatever is stored for an ordered response. Never throws. */
export function orderedResponseFormFromStored(
  stored: unknown,
  rowId: string,
): OrderedResponseFormValues {
  const item = orderedResponseItemSchema.safeParse(stored);
  if (item.success) return toOrderedResponseForm(item.data);
  const blankForm = emptyOrderedResponseForm(rowId);
  if (!isRecord(stored)) return blankForm;
  const content = isRecord(stored.content) ? stored.content : {};
  const answerKey = isRecord(stored.answerKey) ? stored.answerKey : {};
  const rationale = isRecord(stored.rationale) ? stored.rationale : {};
  const perElement = isRecord(rationale.perElement) ? rationale.perElement : {};

  // A repeated step id keeps its first step only, so the editor never lists one step twice.
  const items = storedRecordsWithId(content.items, MAX_STEPS)
    .filter((step, index, all) => all.findIndex((other) => other.id === step.id) === index)
    .map((step) => ({
      id: step.id,
      label: storedString(step.label),
      rationale: markdownText(perElement[step.id]),
    }));
  // Keep a stored key's order for the steps it names; any others follow in content order.
  const keyed = [...new Set(storedStrings(answerKey.orderedIds))];
  const ordered = [
    ...keyed.flatMap((id) => items.filter((step) => step.id === id).slice(0, 1)),
    ...items.filter((step) => !keyed.includes(step.id)),
  ];

  return {
    ...blankForm,
    id: storedId(stored.id, rowId),
    version: storedVersion(stored.version),
    ...storedRecordFormOf(stored),
    ...storedCjmmStepOf(stored),
    tags: storedStrings(stored.tags),
    stem: markdownText(stored.stem),
    instructions: storedString(stored.instructions),
    steps: ordered.length > 0 ? ordered : blankForm.steps,
    partialByPosition: content.partial === "position",
    rationaleGeneral: markdownText(rationale.general),
  };
}
