import { z } from "zod";
import { spanIdsOf } from "../spans";
import { envelopeFields, idSchema, labeledSchema, subsetOf, uniqueIds } from "./common";

// ---------------------------------------------------------------------------
// highlight_text / highlight_table
// ---------------------------------------------------------------------------

export const highlightTokenSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({ kind: z.literal("span"), spanId: idSchema, value: z.string().min(1) }),
]);
export type HighlightToken = z.infer<typeof highlightTokenSchema>;

// Defined without zod so scoring can use it in the browser; re-exported for existing callers.
export { spanIdsOf };

export const highlightTextContentSchema = z.object({
  passage: z.array(highlightTokenSchema).min(1),
});
export const highlightAnswerKeySchema = z.object({ correctSpanIds: z.array(idSchema).min(1) });
export const highlightTextResponseSchema = z.object({
  type: z.literal("highlight_text"),
  spanIds: z.array(idSchema).default([]),
});

function refineSpans(spanIds: string[], correct: string[], ctx: z.RefinementCtx) {
  if (spanIds.length < 2 || !uniqueIds(spanIds)) {
    ctx.addIssue({
      code: "custom",
      message: "at least 2 unique selectable spans",
      path: ["content"],
    });
  }
  if (!subsetOf(correct, spanIds) || !uniqueIds(correct)) {
    ctx.addIssue({ code: "custom", message: "correct spans must exist", path: ["answerKey"] });
  }
}

export const highlightTextItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("highlight_text"),
    content: highlightTextContentSchema,
    answerKey: highlightAnswerKeySchema,
  })
  .superRefine((i, ctx) =>
    refineSpans(spanIdsOf(i.content.passage), i.answerKey.correctSpanIds, ctx),
  );

export const highlightTableContentSchema = z.object({
  columns: z.array(z.string().min(1)).min(2).max(4),
  rows: z
    .array(z.object({ id: idSchema, cells: z.array(z.array(highlightTokenSchema)).min(2).max(4) }))
    .min(1)
    .max(8),
  scorePerRow: z.boolean().default(false),
});
export const highlightTableResponseSchema = z.object({
  type: z.literal("highlight_table"),
  spanIds: z.array(idSchema).default([]),
});
export const highlightTableItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("highlight_table"),
    content: highlightTableContentSchema,
    answerKey: highlightAnswerKeySchema,
  })
  .superRefine((i, ctx) => {
    const spanIds = i.content.rows.flatMap((r) => r.cells.flatMap((c) => spanIdsOf(c)));
    refineSpans(spanIds, i.answerKey.correctSpanIds, ctx);
  });

// ---------------------------------------------------------------------------
// ordered_response (traditional)
// ---------------------------------------------------------------------------

export const orderedResponseContentSchema = z.object({
  items: z.array(labeledSchema).min(4).max(6),
  partial: z.enum(["none", "position"]).default("none"),
});
export const orderedResponseAnswerKeySchema = z.object({
  orderedIds: z.array(idSchema).min(4).max(6),
});
export const orderedResponseResponseSchema = z.object({
  type: z.literal("ordered_response"),
  orderedIds: z.array(idSchema).default([]),
});
export const orderedResponseItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("ordered_response"),
    content: orderedResponseContentSchema,
    answerKey: orderedResponseAnswerKeySchema,
  })
  .refine(
    (i) => {
      const ids = i.content.items.map((x) => x.id);
      return (
        uniqueIds(ids) &&
        uniqueIds(i.answerKey.orderedIds) &&
        i.answerKey.orderedIds.length === ids.length &&
        subsetOf(i.answerKey.orderedIds, ids)
      );
    },
    { message: "orderedIds must be a permutation of the items", path: ["answerKey", "orderedIds"] },
  );

// ---------------------------------------------------------------------------
// bowtie
// ---------------------------------------------------------------------------

export const bowtieContentSchema = z.object({
  actions: z.array(labeledSchema).length(5),
  conditions: z.array(labeledSchema).length(4),
  parameters: z.array(labeledSchema).length(5),
  labels: z
    .object({
      actions: z.string().default("Actions to Take"),
      condition: z.string().default("Potential Condition"),
      parameters: z.string().default("Parameters to Monitor"),
    })
    .default({
      actions: "Actions to Take",
      condition: "Potential Condition",
      parameters: "Parameters to Monitor",
    }),
});
export const bowtieAnswerKeySchema = z.object({
  actionIds: z.array(idSchema).length(2),
  conditionId: idSchema,
  parameterIds: z.array(idSchema).length(2),
});
export const bowtieResponseSchema = z.object({
  type: z.literal("bowtie"),
  actionIds: z.array(idSchema).max(2).default([]),
  conditionId: idSchema.optional(),
  parameterIds: z.array(idSchema).max(2).default([]),
});
export const bowtieItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("bowtie"),
    content: bowtieContentSchema,
    answerKey: bowtieAnswerKeySchema,
  })
  .superRefine((i, ctx) => {
    const a = i.content.actions.map((x) => x.id);
    const c = i.content.conditions.map((x) => x.id);
    const p = i.content.parameters.map((x) => x.id);
    if (!uniqueIds([...a, ...c, ...p])) {
      ctx.addIssue({
        code: "custom",
        message: "bowtie ids must be unique across columns",
        path: ["content"],
      });
    }
    if (!uniqueIds(i.answerKey.actionIds) || !subsetOf(i.answerKey.actionIds, a)) {
      ctx.addIssue({
        code: "custom",
        message: "actionIds must be two distinct actions",
        path: ["answerKey", "actionIds"],
      });
    }
    if (!c.includes(i.answerKey.conditionId)) {
      ctx.addIssue({
        code: "custom",
        message: "conditionId must be a condition",
        path: ["answerKey", "conditionId"],
      });
    }
    if (!uniqueIds(i.answerKey.parameterIds) || !subsetOf(i.answerKey.parameterIds, p)) {
      ctx.addIssue({
        code: "custom",
        message: "parameterIds must be two distinct parameters",
        path: ["answerKey", "parameterIds"],
      });
    }
  });
