import { storedCjmmStepOf } from "./storedValues";
import { recordFormOf, recordInputOf, storedRecordFormOf, type EhrFormValues } from "./ehr";
import {
  matrixMultipleChoiceItemSchema,
  matrixMultipleResponseItemSchema,
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

type MatrixMultipleChoiceItem = ItemOf<"matrix_multiple_choice">;
type MatrixMultipleResponseItem = ItemOf<"matrix_multiple_response">;
type MatrixItem = MatrixMultipleChoiceItem | MatrixMultipleResponseItem;

export interface MatrixRowForm {
  id: string;
  label: string;
  /** The columns marked correct for this row. Matrix multiple choice uses the first one only. */
  correctColumnIds: string[];
  /** Why this row's answer is right; blank means none. */
  rationale: string;
}

export interface MatrixColumnForm {
  id: string;
  label: string;
}

/** One form shape for both matrix types; only the answer key and scoring differ. */
export interface MatrixFormValues {
  id: string;
  version: number;
  tags: string[];
  cjmmStep?: MatrixItem["cjmmStep"];
  difficulty?: MatrixItem["difficulty"];
  ehr?: EhrFormValues;
  meta: MatrixItem["meta"];
  stem: string;
  instructions: string;
  rows: MatrixRowForm[];
  columns: MatrixColumnForm[];
  rationaleGeneral: string;
}

const markdown = (value: string): RichText => ({ kind: "markdown", value });
const blank = (value: string) => value.trim().length === 0;

export function toMatrixForm(item: MatrixItem): MatrixFormValues {
  const perElement = item.rationale.perElement ?? {};
  const correctByRow = new Map<string, string[]>(
    item.type === "matrix_multiple_choice"
      ? item.answerKey.rows.map((row) => [row.rowId, [row.correctColumnId]])
      : item.answerKey.rows.map((row) => [row.rowId, [...row.correctColumnIds]]),
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
    rows: item.content.rows.map((row) => ({
      id: row.id,
      label: row.label,
      correctColumnIds: correctByRow.get(row.id) ?? [],
      rationale: perElement[row.id]?.value ?? "",
    })),
    columns: item.content.columns.map(({ id, label }) => ({ id, label })),
    rationaleGeneral: item.rationale.general?.value ?? "",
  };
}

/** The parts both matrix types share: everything except type, answer key and scoring. */
function envelope(values: MatrixFormValues) {
  const perElement = Object.fromEntries(
    values.rows
      .filter((row) => !blank(row.rationale))
      .map((row) => [row.id, markdown(row.rationale)]),
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
      rows: values.rows.map(({ id, label }) => ({ id, label })),
      columns: values.columns.map(({ id, label }) => ({ id, label })),
    },
    rationale: {
      ...(blank(values.rationaleGeneral) ? {} : { general: markdown(values.rationaleGeneral) }),
      ...(Object.keys(perElement).length > 0 ? { perElement } : {}),
    },
    meta: { ...values.meta },
  };
}

/**
 * Matrix multiple choice: one correct column per row, 0/1 scoring worth one point per row. Every
 * row gets an answer-key entry, even one with nothing marked, so the schema can say which row.
 */
export function fromMatrixMultipleChoiceForm(
  values: MatrixFormValues,
): ItemInputOf<"matrix_multiple_choice"> {
  return {
    ...envelope(values),
    type: "matrix_multiple_choice",
    answerKey: {
      rows: values.rows.map((row) => ({
        rowId: row.id,
        correctColumnId: row.correctColumnIds[0] ?? "",
      })),
    },
    scoring: { model: "zero_one", maxPoints: Math.max(1, values.rows.length) },
  };
}

/** Matrix multiple response: any correct columns per row, +/- scoring worth one point per correct cell. */
export function fromMatrixMultipleResponseForm(
  values: MatrixFormValues,
): ItemInputOf<"matrix_multiple_response"> {
  const correctCells = values.rows.reduce((sum, row) => sum + row.correctColumnIds.length, 0);
  return {
    ...envelope(values),
    type: "matrix_multiple_response",
    answerKey: {
      rows: values.rows.map((row) => ({
        rowId: row.id,
        correctColumnIds: [...row.correctColumnIds],
      })),
    },
    scoring: { model: "plus_minus", maxPoints: Math.max(1, correctCells) },
  };
}

/** A new grid: two blank rows and two blank columns, nothing marked. Invalid until filled in. */
export function emptyMatrixForm(id: string): MatrixFormValues {
  return {
    id,
    version: 1,
    tags: [],
    meta: {},
    stem: "",
    instructions: "",
    rows: ["row_1", "row_2"].map((rowId) => ({
      id: rowId,
      label: "",
      correctColumnIds: [],
      rationale: "",
    })),
    columns: ["col_1", "col_2"].map((columnId) => ({ id: columnId, label: "" })),
    rationaleGeneral: "",
  };
}

// The schema's maximums: 8 rows, 4 columns.
const MAX_ROWS = 8;
const MAX_COLUMNS = 4;

/**
 * Opens whatever is stored for either matrix type. A complete item maps exactly; a draft keeps its
 * well-formed rows, columns and marks (from either answer-key shape) and starts the rest blank.
 * Never throws: stored JSON is external input.
 */
export function matrixFormFromStored(stored: unknown, rowId: string): MatrixFormValues {
  const mc = matrixMultipleChoiceItemSchema.safeParse(stored);
  if (mc.success) return toMatrixForm(mc.data);
  const mr = matrixMultipleResponseItemSchema.safeParse(stored);
  if (mr.success) return toMatrixForm(mr.data);

  const blankForm = emptyMatrixForm(rowId);
  if (!isRecord(stored)) return blankForm;

  const content = isRecord(stored.content) ? stored.content : {};
  const answerKey = isRecord(stored.answerKey) ? stored.answerKey : {};
  const rationale = isRecord(stored.rationale) ? stored.rationale : {};
  const perElement = isRecord(rationale.perElement) ? rationale.perElement : {};

  const correctByRow = new Map<string, string[]>();
  if (Array.isArray(answerKey.rows)) {
    for (const keyRow of answerKey.rows) {
      if (!isRecord(keyRow) || typeof keyRow.rowId !== "string") continue;
      const single =
        typeof keyRow.correctColumnId === "string" && keyRow.correctColumnId.length > 0
          ? [keyRow.correctColumnId]
          : [];
      correctByRow.set(keyRow.rowId, [...storedStrings(keyRow.correctColumnIds), ...single]);
    }
  }

  const rows = storedRecordsWithId(content.rows, MAX_ROWS).map((row) => ({
    id: row.id,
    label: storedString(row.label),
    correctColumnIds: correctByRow.get(row.id) ?? [],
    rationale: markdownText(perElement[row.id]),
  }));
  const columns = storedRecordsWithId(content.columns, MAX_COLUMNS).map((column) => ({
    id: column.id,
    label: storedString(column.label),
  }));

  return {
    ...blankForm,
    id: storedId(stored.id, rowId),
    version: storedVersion(stored.version),
    ...storedRecordFormOf(stored),
    ...storedCjmmStepOf(stored),
    tags: storedStrings(stored.tags),
    stem: markdownText(stored.stem),
    instructions: storedString(stored.instructions),
    rows: rows.length > 0 ? rows : blankForm.rows,
    columns: columns.length > 0 ? columns : blankForm.columns,
    rationaleGeneral: markdownText(rationale.general),
  };
}
