import {
  dropdownTableItemSchema,
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

type DropdownTableItem = ItemOf<"dropdown_table">;

export interface DropdownTableChoiceForm {
  id: string;
  label: string;
}

export interface DropdownTableRowForm {
  id: string;
  /** What the row asks about, e.g. "Digoxin 0.125 mg PO". */
  label: string;
  choices: DropdownTableChoiceForm[];
  /** The id of the correct choice, or "" while none is chosen. */
  correctChoiceId: string;
}

export interface DropdownTableFormValues {
  id: string;
  version: number;
  tags: string[];
  cjmmStep?: DropdownTableItem["cjmmStep"];
  difficulty?: DropdownTableItem["difficulty"];
  ehr?: DropdownTableItem["ehr"];
  meta: DropdownTableItem["meta"];
  /** Carried through untouched; per-row rationale in the table editor arrives with #49. */
  rationale: DropdownTableItem["rationale"];
  stem: string;
  instructions: string;
  /** Heading over the row labels, e.g. "Medication". */
  columnLabel: string;
  /** Heading over the drop-downs, e.g. "Nursing action". */
  dropdownLabel: string;
  rows: DropdownTableRowForm[];
}

const markdown = (value: string): RichText => ({ kind: "markdown", value });
const blank = (value: string) => value.trim().length === 0;

export function toDropdownTableForm(item: DropdownTableItem): DropdownTableFormValues {
  const correctByRow = new Map(item.answerKey.rows.map((row) => [row.rowId, row.correctChoiceId]));
  return {
    id: item.id,
    version: item.version,
    tags: [...item.tags],
    cjmmStep: item.cjmmStep,
    difficulty: item.difficulty,
    ehr: item.ehr,
    meta: { ...item.meta },
    rationale: item.rationale,
    stem: item.stem.value,
    instructions: item.instructions ?? "",
    columnLabel: item.content.columns.label,
    dropdownLabel: item.content.columns.dropdown,
    rows: item.content.rows.map((row) => ({
      id: row.id,
      label: row.label,
      choices: row.choices.map(({ id, label }) => ({ id, label })),
      correctChoiceId: correctByRow.get(row.id) ?? "",
    })),
  };
}

/**
 * Builds item input from the form: one answer-key row per table row, in order, even while nothing
 * is chosen, and 0/1 scoring worth one point per row.
 */
export function fromDropdownTableForm(
  values: DropdownTableFormValues,
): ItemInputOf<"dropdown_table"> {
  return {
    id: values.id,
    type: "dropdown_table",
    version: values.version,
    tags: [...values.tags],
    ...(values.cjmmStep !== undefined ? { cjmmStep: values.cjmmStep } : {}),
    ...(values.difficulty !== undefined ? { difficulty: values.difficulty } : {}),
    ...(values.ehr !== undefined ? { ehr: values.ehr } : {}),
    stem: markdown(values.stem),
    ...(blank(values.instructions) ? {} : { instructions: values.instructions }),
    content: {
      columns: { label: values.columnLabel, dropdown: values.dropdownLabel },
      rows: values.rows.map((row) => ({
        id: row.id,
        label: row.label,
        choices: row.choices.map(({ id, label }) => ({ id, label })),
      })),
    },
    answerKey: {
      rows: values.rows.map((row) => ({ rowId: row.id, correctChoiceId: row.correctChoiceId })),
    },
    scoring: { model: "zero_one", maxPoints: Math.max(1, values.rows.length) },
    rationale: values.rationale,
    meta: { ...values.meta },
  };
}

/** A new table: two blank rows with two blank choices each, nothing chosen. Invalid until filled in. */
export function emptyDropdownTableForm(id: string): DropdownTableFormValues {
  const row = (index: number): DropdownTableRowForm => ({
    id: `row_${index + 1}`,
    label: "",
    choices: ["a", "b"].map((suffix) => ({ id: `row_${index + 1}_${suffix}`, label: "" })),
    correctChoiceId: "",
  });
  return {
    id,
    version: 1,
    tags: [],
    meta: {},
    rationale: {},
    stem: "",
    instructions: "",
    columnLabel: "",
    dropdownLabel: "",
    rows: [row(0), row(1)],
  };
}

// The schema's maximums: 8 rows, 6 choices in each.
const MAX_ROWS = 8;
const MAX_CHOICES = 6;

/**
 * Opens whatever is stored for a drop-down table. A complete item maps exactly; a draft keeps its
 * well-formed headings, rows, choices and chosen answers, and starts the rest blank. Never throws.
 */
export function dropdownTableFormFromStored(
  stored: unknown,
  rowId: string,
): DropdownTableFormValues {
  const parsed = dropdownTableItemSchema.safeParse(stored);
  if (parsed.success) return toDropdownTableForm(parsed.data);

  const blankForm = emptyDropdownTableForm(rowId);
  if (!isRecord(stored)) return blankForm;

  const content = isRecord(stored.content) ? stored.content : {};
  const headings = isRecord(content.columns) ? content.columns : {};
  const answerKey = isRecord(stored.answerKey) ? stored.answerKey : {};

  const correctByRow = new Map<string, string>();
  if (Array.isArray(answerKey.rows)) {
    for (const keyRow of answerKey.rows) {
      if (
        isRecord(keyRow) &&
        typeof keyRow.rowId === "string" &&
        typeof keyRow.correctChoiceId === "string"
      ) {
        correctByRow.set(keyRow.rowId, keyRow.correctChoiceId);
      }
    }
  }

  const rows = storedRecordsWithId(content.rows, MAX_ROWS).map((row) => ({
    id: row.id,
    label: storedString(row.label),
    choices: storedRecordsWithId(row.choices, MAX_CHOICES).map((choice) => ({
      id: choice.id,
      label: storedString(choice.label),
    })),
    correctChoiceId: correctByRow.get(row.id) ?? "",
  }));

  const rationale = rationaleSchema.safeParse(stored.rationale);

  return {
    ...blankForm,
    id: storedId(stored.id, rowId),
    version: storedVersion(stored.version),
    tags: storedStrings(stored.tags),
    rationale: rationale.success ? rationale.data : blankForm.rationale,
    stem: markdownText(stored.stem),
    instructions: storedString(stored.instructions),
    columnLabel: storedString(headings.label),
    dropdownLabel: storedString(headings.dropdown),
    rows: rows.length > 0 ? rows : blankForm.rows,
  };
}
