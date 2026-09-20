import { storedCjmmStepOf } from "./storedValues";
import { recordFormOf, recordInputOf, storedRecordFormOf, type EhrFormValues } from "./ehr";
import {
  multipleResponseGroupingItemSchema,
  rationaleSchema,
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

type GroupingItem = ItemOf<"multiple_response_grouping">;

export interface GroupingOptionForm {
  id: string;
  label: string;
  /** Marked as correct within its group. */
  correct: boolean;
}

export interface GroupingRowForm {
  id: string;
  /** The group's name, e.g. "Respiratory". */
  label: string;
  options: GroupingOptionForm[];
}

export interface GroupingFormValues {
  id: string;
  version: number;
  tags: string[];
  cjmmStep?: GroupingItem["cjmmStep"];
  difficulty?: GroupingItem["difficulty"];
  ehr?: EhrFormValues;
  meta: GroupingItem["meta"];
  /** Per-element rationale, carried through untouched until this editor edits it (#49). */
  rationale: GroupingItem["rationale"];
  /** The general rationale; publishing needs one. */
  rationaleGeneral: string;
  stem: string;
  instructions: string;
  rows: GroupingRowForm[];
}

const markdown = (value: string): RichText => ({ kind: "markdown", value });
const blank = (value: string) => value.trim().length === 0;
const perElementOnly = (rationale: GroupingItem["rationale"]): GroupingItem["rationale"] =>
  rationale.perElement ? { perElement: rationale.perElement } : {};

export function toGroupingForm(item: GroupingItem): GroupingFormValues {
  const correctByRow = new Map(
    item.answerKey.rows.map((row) => [row.rowId, new Set(row.correctOptionIds)]),
  );
  return {
    id: item.id,
    version: item.version,
    tags: [...item.tags],
    cjmmStep: item.cjmmStep,
    difficulty: item.difficulty,
    ...recordFormOf(item.ehr),
    meta: { ...item.meta },
    rationale: perElementOnly(item.rationale),
    rationaleGeneral: item.rationale.general?.value ?? "",
    stem: item.stem.value,
    instructions: item.instructions ?? "",
    rows: item.content.rows.map((row) => ({
      id: row.id,
      label: row.label,
      options: row.options.map((option) => ({
        id: option.id,
        label: option.label,
        correct: correctByRow.get(row.id)?.has(option.id) ?? false,
      })),
    })),
  };
}

/**
 * Builds item input from the form. The answer key has one row per group in group order, even a
 * group with nothing marked, so the schema can say which group needs an answer. Scoring is +/-,
 * one point per correct option across all groups, derived rather than edited.
 */
export function fromGroupingForm(
  values: GroupingFormValues,
): ItemInputOf<"multiple_response_grouping"> {
  const keyRows = values.rows.map((row) => ({
    rowId: row.id,
    correctOptionIds: row.options.filter((option) => option.correct).map((option) => option.id),
  }));
  const correctCount = keyRows.reduce((sum, row) => sum + row.correctOptionIds.length, 0);

  return {
    id: values.id,
    type: "multiple_response_grouping",
    version: values.version,
    tags: [...values.tags],
    ...(values.cjmmStep !== undefined ? { cjmmStep: values.cjmmStep } : {}),
    ...(values.difficulty !== undefined ? { difficulty: values.difficulty } : {}),
    ...recordInputOf(values.ehr),
    stem: markdown(values.stem),
    ...(blank(values.instructions) ? {} : { instructions: values.instructions }),
    content: {
      rows: values.rows.map((row) => ({
        id: row.id,
        label: row.label,
        options: row.options.map(({ id, label }) => ({ id, label })),
      })),
    },
    answerKey: { rows: keyRows },
    scoring: { model: "plus_minus", maxPoints: Math.max(1, correctCount) },
    rationale: {
      ...perElementOnly(values.rationale),
      ...(blank(values.rationaleGeneral) ? {} : { general: markdown(values.rationaleGeneral) }),
    },
    meta: { ...values.meta },
  };
}

/** A new item: two blank groups with two blank options each. Invalid until filled in. */
export function emptyGroupingForm(id: string): GroupingFormValues {
  const row = (rowIndex: number): GroupingRowForm => ({
    id: `row_${rowIndex + 1}`,
    label: "",
    options: ["a", "b"].map((suffix) => ({
      id: `row_${rowIndex + 1}_${suffix}`,
      label: "",
      correct: false,
    })),
  });
  return {
    id,
    version: 1,
    tags: [],
    meta: {},
    rationale: {},
    rationaleGeneral: "",
    stem: "",
    instructions: "",
    rows: [row(0), row(1)],
  };
}

// The schema's maximums: 8 groups, 4 options in each.
const MAX_ROWS = 8;
const MAX_OPTIONS = 4;

/**
 * Opens whatever is stored for a grouping item. A complete item maps exactly; a draft keeps its
 * well-formed groups, options and marks, and starts the rest blank. Never throws.
 */
export function groupingFormFromStored(stored: unknown, rowId: string): GroupingFormValues {
  const parsed = multipleResponseGroupingItemSchema.safeParse(stored);
  if (parsed.success) return toGroupingForm(parsed.data);

  const blankForm = emptyGroupingForm(rowId);
  if (!isRecord(stored)) return blankForm;

  const content = isRecord(stored.content) ? stored.content : {};
  const answerKey = isRecord(stored.answerKey) ? stored.answerKey : {};
  const correctByRow = new Map<string, Set<string>>();
  if (Array.isArray(answerKey.rows)) {
    for (const keyRow of answerKey.rows) {
      if (isRecord(keyRow) && typeof keyRow.rowId === "string") {
        correctByRow.set(keyRow.rowId, new Set(storedStrings(keyRow.correctOptionIds)));
      }
    }
  }

  const rows = storedRecordsWithId(content.rows, MAX_ROWS).map((row) => {
    const correct = correctByRow.get(row.id) ?? new Set<string>();
    return {
      id: row.id,
      label: storedString(row.label),
      options: storedRecordsWithId(row.options, MAX_OPTIONS).map((option) => ({
        id: option.id,
        label: storedString(option.label),
        correct: correct.has(option.id),
      })),
    };
  });

  const rationale = rationaleSchema.safeParse(stored.rationale);

  return {
    ...blankForm,
    id: storedId(stored.id, rowId),
    version: storedVersion(stored.version),
    ...storedRecordFormOf(stored),
    ...storedCjmmStepOf(stored),
    tags: storedStrings(stored.tags),
    rationale: rationale.success ? perElementOnly(rationale.data) : blankForm.rationale,
    rationaleGeneral: markdownText(
      isRecord(stored.rationale) ? stored.rationale.general : undefined,
    ),
    stem: markdownText(stored.stem),
    instructions: storedString(stored.instructions),
    rows: rows.length > 0 ? rows : blankForm.rows,
  };
}
