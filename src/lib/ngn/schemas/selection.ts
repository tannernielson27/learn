import { z } from "zod";
import { envelopeFields, idSchema, labeledSchema, subsetOf, uniqueIds } from "./common";

// ---------------------------------------------------------------------------
// multiple_choice (traditional)
// ---------------------------------------------------------------------------

export const multipleChoiceContentSchema = z.object({
  options: z
    .array(labeledSchema)
    .min(4)
    .max(6)
    .refine((o) => uniqueIds(o.map((x) => x.id)), {
      message: "option ids must be unique",
    }),
});
export const multipleChoiceAnswerKeySchema = z.object({ correctOptionId: idSchema });
export const multipleChoiceResponseSchema = z.object({
  type: z.literal("multiple_choice"),
  optionId: idSchema.optional(),
});
export const multipleChoiceItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("multiple_choice"),
    content: multipleChoiceContentSchema,
    answerKey: multipleChoiceAnswerKeySchema,
  })
  .refine((i) => i.content.options.some((o) => o.id === i.answerKey.correctOptionId), {
    message: "correctOptionId must be one of the options",
    path: ["answerKey", "correctOptionId"],
  });

// ---------------------------------------------------------------------------
// multiple_response (SATA / Select N)
// ---------------------------------------------------------------------------

export const multipleResponseContentSchema = z.object({
  variant: z.enum(["sata", "select_n"]),
  n: z.number().int().min(1).optional(),
  options: z
    .array(labeledSchema)
    .min(5)
    .max(10)
    .refine((o) => uniqueIds(o.map((x) => x.id)), {
      message: "option ids must be unique",
    }),
});
export const multipleResponseAnswerKeySchema = z.object({
  correctOptionIds: z.array(idSchema).min(1),
});
export const multipleResponseResponseSchema = z.object({
  type: z.literal("multiple_response"),
  optionIds: z.array(idSchema).default([]),
});
export const multipleResponseItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("multiple_response"),
    content: multipleResponseContentSchema,
    answerKey: multipleResponseAnswerKeySchema,
  })
  .superRefine((i, ctx) => {
    const optionIds = i.content.options.map((o) => o.id);
    if (!subsetOf(i.answerKey.correctOptionIds, optionIds)) {
      ctx.addIssue({
        code: "custom",
        message: "correctOptionIds must be options",
        path: ["answerKey"],
      });
    }
    if (i.content.variant === "select_n") {
      const n = i.content.n;
      if (n === undefined || n >= optionIds.length) {
        ctx.addIssue({
          code: "custom",
          message: "select_n requires n < option count",
          path: ["content", "n"],
        });
      } else if (i.answerKey.correctOptionIds.length !== n) {
        ctx.addIssue({
          code: "custom",
          message: "select_n requires exactly n correct options",
          path: ["answerKey"],
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// multiple_response_grouping
// ---------------------------------------------------------------------------

const groupingRowSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  options: z.array(labeledSchema).min(2).max(4),
});
export const multipleResponseGroupingContentSchema = z.object({
  rows: z.array(groupingRowSchema).min(2).max(8),
});
export const multipleResponseGroupingAnswerKeySchema = z.object({
  rows: z.array(z.object({ rowId: idSchema, correctOptionIds: z.array(idSchema).min(1) })).min(1),
});
export const multipleResponseGroupingResponseSchema = z.object({
  type: z.literal("multiple_response_grouping"),
  rows: z.array(z.object({ rowId: idSchema, optionIds: z.array(idSchema) })).default([]),
});
export const multipleResponseGroupingItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("multiple_response_grouping"),
    content: multipleResponseGroupingContentSchema,
    answerKey: multipleResponseGroupingAnswerKeySchema,
  })
  .superRefine((i, ctx) => {
    const rowIds = i.content.rows.map((r) => r.id);
    if (
      i.answerKey.rows.length !== rowIds.length ||
      !subsetOf(
        i.answerKey.rows.map((r) => r.rowId),
        rowIds,
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "answer key must cover every row exactly once",
        path: ["answerKey"],
      });
    }
    for (const keyRow of i.answerKey.rows) {
      const row = i.content.rows.find((r) => r.id === keyRow.rowId);
      if (
        row &&
        !subsetOf(
          keyRow.correctOptionIds,
          row.options.map((o) => o.id),
        )
      ) {
        ctx.addIssue({
          code: "custom",
          message: `row ${keyRow.rowId}: correct options must exist`,
          path: ["answerKey"],
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// matrix_multiple_choice / matrix_multiple_response
// ---------------------------------------------------------------------------

const matrixContentSchema = z.object({
  rows: z.array(labeledSchema).min(2).max(8),
  columns: z.array(labeledSchema).min(2).max(4),
});
export const matrixMultipleChoiceContentSchema = matrixContentSchema;
export const matrixMultipleChoiceAnswerKeySchema = z.object({
  rows: z.array(z.object({ rowId: idSchema, correctColumnId: idSchema })).min(1),
});
export const matrixMultipleChoiceResponseSchema = z.object({
  type: z.literal("matrix_multiple_choice"),
  rows: z.array(z.object({ rowId: idSchema, columnId: idSchema })).default([]),
});
export const matrixMultipleChoiceItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("matrix_multiple_choice"),
    content: matrixMultipleChoiceContentSchema,
    answerKey: matrixMultipleChoiceAnswerKeySchema,
  })
  .superRefine((i, ctx) => {
    const rowIds = i.content.rows.map((r) => r.id);
    const colIds = i.content.columns.map((c) => c.id);
    const keyRows = i.answerKey.rows.map((r) => r.rowId);
    if (keyRows.length !== rowIds.length || !uniqueIds(keyRows) || !subsetOf(keyRows, rowIds)) {
      ctx.addIssue({
        code: "custom",
        message: "exactly one correct column per row",
        path: ["answerKey"],
      });
    }
    if (
      !subsetOf(
        i.answerKey.rows.map((r) => r.correctColumnId),
        colIds,
      )
    ) {
      ctx.addIssue({ code: "custom", message: "correct column must exist", path: ["answerKey"] });
    }
  });

export const matrixMultipleResponseContentSchema = matrixContentSchema;
export const matrixMultipleResponseAnswerKeySchema = z.object({
  rows: z.array(z.object({ rowId: idSchema, correctColumnIds: z.array(idSchema).min(1) })).min(1),
});
export const matrixMultipleResponseResponseSchema = z.object({
  type: z.literal("matrix_multiple_response"),
  rows: z.array(z.object({ rowId: idSchema, columnIds: z.array(idSchema) })).default([]),
});
export const matrixMultipleResponseItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("matrix_multiple_response"),
    content: matrixMultipleResponseContentSchema,
    answerKey: matrixMultipleResponseAnswerKeySchema,
  })
  .superRefine((i, ctx) => {
    const rowIds = i.content.rows.map((r) => r.id);
    const colIds = i.content.columns.map((c) => c.id);
    const keyRows = i.answerKey.rows.map((r) => r.rowId);
    if (keyRows.length !== rowIds.length || !uniqueIds(keyRows) || !subsetOf(keyRows, rowIds)) {
      ctx.addIssue({
        code: "custom",
        message: "answer key must cover every row exactly once",
        path: ["answerKey"],
      });
    }
    if (!i.answerKey.rows.every((r) => subsetOf(r.correctColumnIds, colIds))) {
      ctx.addIssue({ code: "custom", message: "correct columns must exist", path: ["answerKey"] });
    }
  });
