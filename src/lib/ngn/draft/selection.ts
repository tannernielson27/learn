import { z } from "zod";
import type { ItemOf } from "../schemas";
import {
  draftAnswerField,
  draftEnvelopeFields,
  draftOptionSchema,
  elementRationale,
  envelopeDraftOf,
  envelopeOf,
  needsAnswer,
  needsFix,
  numberedId,
  optionId,
  perElementOf,
  readOptionKeys,
  resolveScoring,
  STATED_RULE_TEXT,
  type DraftContext,
  type DraftConversion,
  type DraftReason,
} from "./common";
import { isMarkedCell, normalizeLine, readMarked, statedSelectCount } from "./text";

const MARKED = " *";
const withMark = (label: string, correct: boolean): string =>
  correct ? `${label}${MARKED}` : label;

const ZERO_ONE = { default: "zero_one", allowed: ["zero_one"] } as const;
const PLUS_MINUS = { default: "plus_minus", allowed: ["plus_minus"] } as const;

const NO_KEY = "The source marks no answer. Add the key before this question can be imported.";

// ---------------------------------------------------------------------------
// multiple_choice
// ---------------------------------------------------------------------------

export const multipleChoiceDraftSchema = z.object({
  type: z.literal("multiple_choice"),
  ...draftEnvelopeFields,
  options: z.array(draftOptionSchema).describe("Every option, in the order the source lists them."),
  answer: draftAnswerField,
});
export type MultipleChoiceDraft = z.infer<typeof multipleChoiceDraftSchema>;

export function fromMultipleChoiceDraft(
  draft: MultipleChoiceDraft,
  context: DraftContext = {},
): DraftConversion<"multiple_choice"> {
  const options = draft.options.map((option, index) => ({ ...option, id: optionId(index) }));
  const { labels, keys, reasons: keyReasons } = readOptionKeys(draft.options, draft.answer);
  const scoring = resolveScoring(draft.statedScoring, ZERO_ONE);
  const unique = keys === undefined ? [] : [...new Set(keys)];
  const keyReason: DraftReason[] =
    keyReasons.length > 0
      ? []
      : keys === undefined
        ? [needsAnswer(NO_KEY)]
        : unique.length > 1
          ? [
              needsFix(
                `${unique.length} options are marked; a multiple choice question has one answer.`,
                ["options"],
              ),
            ]
          : [];
  return {
    item: {
      ...envelopeOf(draft, context, perElementOf(options)),
      type: "multiple_choice",
      content: {
        options: options.map((option, index) => ({ id: option.id, label: labels[index] })),
      },
      answerKey: { correctOptionId: unique.length === 1 ? optionId(unique[0]) : "" },
      scoring: { model: scoring.rule, maxPoints: 1 },
    },
    reasons: [...keyReasons, ...keyReason, ...scoring.reasons],
  };
}

export function toMultipleChoiceDraft(item: ItemOf<"multiple_choice">): MultipleChoiceDraft {
  return {
    type: "multiple_choice",
    ...envelopeDraftOf(item, STATED_RULE_TEXT[item.scoring.model]),
    options: item.content.options.map((option) => ({
      text: withMark(option.label, option.id === item.answerKey.correctOptionId),
      ...elementRationale(item, option.id),
    })),
  };
}

// ---------------------------------------------------------------------------
// multiple_response (select all that apply, select N)
// ---------------------------------------------------------------------------

export const multipleResponseDraftSchema = z.object({
  type: z.literal("multiple_response"),
  ...draftEnvelopeFields,
  options: z.array(draftOptionSchema).describe("Every option, in the order the source lists them."),
  answer: draftAnswerField,
});
export type MultipleResponseDraft = z.infer<typeof multipleResponseDraftSchema>;

export function fromMultipleResponseDraft(
  draft: MultipleResponseDraft,
  context: DraftContext = {},
): DraftConversion<"multiple_response"> {
  const options = draft.options.map((option, index) => ({ ...option, id: optionId(index) }));
  const { labels, keys, reasons: keyReasons } = readOptionKeys(draft.options, draft.answer);
  const scoring = resolveScoring(draft.statedScoring, PLUS_MINUS);
  const correct = keys === undefined ? [] : [...new Set(keys)].sort((a, b) => a - b);
  const n = statedSelectCount(draft.stem, draft.instructions);
  const keyReason: DraftReason[] =
    keyReasons.length > 0
      ? []
      : keys === undefined
        ? [needsAnswer(NO_KEY)]
        : n !== undefined && correct.length !== n
          ? [
              needsFix(
                `The question asks for ${n} answers, but the source marks ${correct.length}.`,
                ["options"],
              ),
            ]
          : [];
  return {
    item: {
      ...envelopeOf(draft, context, perElementOf(options)),
      type: "multiple_response",
      content: {
        variant: n === undefined ? "sata" : "select_n",
        ...(n !== undefined ? { n } : {}),
        options: options.map((option, index) => ({ id: option.id, label: labels[index] })),
      },
      answerKey: { correctOptionIds: correct.map(optionId) },
      scoring: { model: scoring.rule, maxPoints: Math.max(1, correct.length) },
    },
    reasons: [...keyReasons, ...keyReason, ...scoring.reasons],
  };
}

export function toMultipleResponseDraft(item: ItemOf<"multiple_response">): MultipleResponseDraft {
  const correct = new Set(item.answerKey.correctOptionIds);
  return {
    type: "multiple_response",
    ...envelopeDraftOf(item, STATED_RULE_TEXT[item.scoring.model]),
    options: item.content.options.map((option) => ({
      text: withMark(option.label, correct.has(option.id)),
      ...elementRationale(item, option.id),
    })),
  };
}

// ---------------------------------------------------------------------------
// multiple_response_grouping
// ---------------------------------------------------------------------------

export const multipleResponseGroupingDraftSchema = z.object({
  type: z.literal("multiple_response_grouping"),
  ...draftEnvelopeFields,
  rows: z
    .array(
      z.object({
        label: z
          .string()
          .describe("The row's heading, such as a body system, copied word for word."),
        options: z
          .array(draftOptionSchema)
          .describe("The row's option cells, in the order the source lists them."),
      }),
    )
    .describe("Every row of the table, in the order the source lists them."),
});
export type MultipleResponseGroupingDraft = z.infer<typeof multipleResponseGroupingDraftSchema>;

export function fromMultipleResponseGroupingDraft(
  draft: MultipleResponseGroupingDraft,
  context: DraftContext = {},
): DraftConversion<"multiple_response_grouping"> {
  const rows = draft.rows.map((row, rowIndex) => {
    const id = numberedId("row", rowIndex);
    const options = row.options.map((option, index) => {
      const read = readMarked(option.text);
      return { ...option, id: `${id}_${String.fromCharCode(97 + index)}`, ...read };
    });
    return { id, label: normalizeLine(row.label), options };
  });
  const scoring = resolveScoring(draft.statedScoring, PLUS_MINUS);
  const keyRows = rows.map((row) => ({
    rowId: row.id,
    correctOptionIds: row.options.filter((option) => option.marked).map((option) => option.id),
  }));
  const keyed = keyRows.filter((row) => row.correctOptionIds.length > 0);
  const keyReasons: DraftReason[] =
    keyed.length === 0
      ? [needsAnswer(NO_KEY)]
      : keyRows.flatMap((row, index) =>
          row.correctOptionIds.length === 0
            ? [needsFix(`Row ${index + 1} has no marked answer.`, ["rows", index])]
            : [],
        );
  const total = keyed.reduce((sum, row) => sum + row.correctOptionIds.length, 0);
  return {
    item: {
      ...envelopeOf(draft, context, perElementOf(rows.flatMap((row) => row.options))),
      type: "multiple_response_grouping",
      content: {
        rows: rows.map((row) => ({
          id: row.id,
          label: row.label,
          options: row.options.map((option) => ({ id: option.id, label: option.text })),
        })),
      },
      answerKey: { rows: keyed },
      scoring: { model: scoring.rule, maxPoints: Math.max(1, total) },
    },
    reasons: [...keyReasons, ...scoring.reasons],
  };
}

export function toMultipleResponseGroupingDraft(
  item: ItemOf<"multiple_response_grouping">,
): MultipleResponseGroupingDraft {
  const correct = new Set(item.answerKey.rows.flatMap((row) => row.correctOptionIds));
  return {
    type: "multiple_response_grouping",
    ...envelopeDraftOf(item, STATED_RULE_TEXT[item.scoring.model]),
    rows: item.content.rows.map((row) => ({
      label: row.label,
      options: row.options.map((option) => ({
        text: withMark(option.label, correct.has(option.id)),
        ...elementRationale(item, option.id),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// matrix_multiple_choice / matrix_multiple_response
// ---------------------------------------------------------------------------

const matrixDraftFields = {
  ...draftEnvelopeFields,
  columns: z
    .array(z.string())
    .describe(
      "The column headings that can be chosen for each row, such as Indicated / Contraindicated, word for word. Leave out the heading over the row labels.",
    ),
  rows: z
    .array(
      z.object({
        text: z.string().describe("The row's label, word for word."),
        cells: z
          .array(z.string())
          .describe(
            'One entry per column, in column order: the mark the source puts in that cell ("*", a check mark or "X"), or "" when the cell is empty. Never mark a cell the source leaves empty.',
          ),
        rationale: draftOptionSchema.shape.rationale,
      }),
    )
    .describe("Every row of the table, in the order the source lists them."),
};

export const matrixMultipleChoiceDraftSchema = z.object({
  type: z.literal("matrix_multiple_choice"),
  ...matrixDraftFields,
});
export type MatrixMultipleChoiceDraft = z.infer<typeof matrixMultipleChoiceDraftSchema>;

export const matrixMultipleResponseDraftSchema = z.object({
  type: z.literal("matrix_multiple_response"),
  ...matrixDraftFields,
});
export type MatrixMultipleResponseDraft = z.infer<typeof matrixMultipleResponseDraftSchema>;

type MatrixDraft = MatrixMultipleChoiceDraft | MatrixMultipleResponseDraft;

interface MatrixParts {
  rows: { id: string; label: string; rationale?: string; marked: string[] }[];
  columns: { id: string; label: string }[];
  reasons: DraftReason[];
  anyMarked: boolean;
}

/** Rows and columns with ids, each row's marked columns, and any row whose cells do not line up. */
function matrixParts(draft: MatrixDraft): MatrixParts {
  const columns = draft.columns.map((label, index) => ({
    id: numberedId("col", index),
    label: normalizeLine(label),
  }));
  const rows = draft.rows.map((row, index) => ({
    id: numberedId("row", index),
    label: readMarked(row.text).text,
    ...(row.rationale !== undefined ? { rationale: row.rationale } : {}),
    marked: columns.filter((_, column) => isMarkedCell(row.cells[column] ?? "")).map((c) => c.id),
  }));
  const reasons = draft.rows.flatMap((row, index) =>
    row.cells.length === columns.length
      ? []
      : [
          needsFix(
            `Row ${index + 1} has ${row.cells.length} cells for ${columns.length} columns.`,
            ["rows", index, "cells"],
          ),
        ],
  );
  return { rows, columns, reasons, anyMarked: rows.some((row) => row.marked.length > 0) };
}

function matrixEnvelope(draft: MatrixDraft, context: DraftContext, parts: MatrixParts) {
  return {
    ...envelopeOf(draft, context, perElementOf(parts.rows)),
    content: {
      rows: parts.rows.map((row) => ({ id: row.id, label: row.label })),
      columns: parts.columns,
    },
  };
}

export function fromMatrixMultipleChoiceDraft(
  draft: MatrixMultipleChoiceDraft,
  context: DraftContext = {},
): DraftConversion<"matrix_multiple_choice"> {
  const parts = matrixParts(draft);
  const scoring = resolveScoring(draft.statedScoring, ZERO_ONE);
  const keyReasons: DraftReason[] = !parts.anyMarked
    ? [needsAnswer(NO_KEY)]
    : parts.rows.flatMap((row, index) =>
        row.marked.length === 1
          ? []
          : [
              needsFix(
                `Row ${index + 1} has ${row.marked.length} marked columns; each row needs exactly one.`,
                ["rows", index, "cells"],
              ),
            ],
      );
  return {
    item: {
      ...matrixEnvelope(draft, context, parts),
      type: "matrix_multiple_choice",
      answerKey: {
        rows: parts.rows
          .filter((row) => row.marked.length === 1)
          .map((row) => ({ rowId: row.id, correctColumnId: row.marked[0] })),
      },
      scoring: { model: scoring.rule, maxPoints: Math.max(1, parts.rows.length) },
    },
    reasons: [...parts.reasons, ...keyReasons, ...scoring.reasons],
  };
}

export function fromMatrixMultipleResponseDraft(
  draft: MatrixMultipleResponseDraft,
  context: DraftContext = {},
): DraftConversion<"matrix_multiple_response"> {
  const parts = matrixParts(draft);
  const scoring = resolveScoring(draft.statedScoring, PLUS_MINUS);
  const keyReasons: DraftReason[] = !parts.anyMarked
    ? [needsAnswer(NO_KEY)]
    : parts.rows.flatMap((row, index) =>
        row.marked.length > 0
          ? []
          : [needsFix(`Row ${index + 1} has no marked answer.`, ["rows", index, "cells"])],
      );
  const keyed = parts.rows.filter((row) => row.marked.length > 0);
  const total = keyed.reduce((sum, row) => sum + row.marked.length, 0);
  return {
    item: {
      ...matrixEnvelope(draft, context, parts),
      type: "matrix_multiple_response",
      answerKey: {
        rows: keyed.map((row) => ({ rowId: row.id, correctColumnIds: row.marked })),
      },
      scoring: { model: scoring.rule, maxPoints: Math.max(1, total) },
    },
    reasons: [...parts.reasons, ...keyReasons, ...scoring.reasons],
  };
}

function matrixDraftOf(
  item: ItemOf<"matrix_multiple_choice"> | ItemOf<"matrix_multiple_response">,
  correctOf: (rowId: string) => readonly string[],
) {
  return {
    ...envelopeDraftOf(item, STATED_RULE_TEXT[item.scoring.model]),
    columns: item.content.columns.map((column) => column.label),
    rows: item.content.rows.map((row) => {
      const correct = correctOf(row.id);
      return {
        text: row.label,
        cells: item.content.columns.map((column) => (correct.includes(column.id) ? "*" : "")),
        ...elementRationale(item, row.id),
      };
    }),
  };
}

export function toMatrixMultipleChoiceDraft(
  item: ItemOf<"matrix_multiple_choice">,
): MatrixMultipleChoiceDraft {
  return {
    type: "matrix_multiple_choice",
    ...matrixDraftOf(item, (rowId) =>
      item.answerKey.rows.filter((row) => row.rowId === rowId).map((row) => row.correctColumnId),
    ),
  };
}

export function toMatrixMultipleResponseDraft(
  item: ItemOf<"matrix_multiple_response">,
): MatrixMultipleResponseDraft {
  return {
    type: "matrix_multiple_response",
    ...matrixDraftOf(
      item,
      (rowId) => item.answerKey.rows.find((row) => row.rowId === rowId)?.correctColumnIds ?? [],
    ),
  };
}
