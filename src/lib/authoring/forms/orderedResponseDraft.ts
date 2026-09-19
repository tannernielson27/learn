import { z } from "zod";
import { ehrFormDraftSchema } from "./ehrDraft";
import { cjmmStepSchema, idSchema, itemMetaSchema } from "@/lib/ngn/schemas";
import { draftTagsSchema } from "./draftTags";
import { DRAFT_ERROR, type DraftParseResult } from "./draft";
import type { OrderedResponseFormValues } from "./orderedResponse";

/**
 * What Save draft accepts for an ordered response: every field typed and size-limited, unknown
 * fields refused, at most the schema's six steps, and no repeated step ids.
 */
const draftSchema = z.strictObject({
  id: idSchema,
  version: z.number().int().min(1),
  tags: draftTagsSchema,
  cjmmStep: cjmmStepSchema.optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  ehr: ehrFormDraftSchema.optional(),
  meta: itemMetaSchema,
  stem: z.string().max(20_000),
  instructions: z.string().max(2_000),
  steps: z
    .array(
      z.strictObject({
        id: idSchema,
        label: z.string().max(2_000),
        rationale: z.string().max(5_000),
      }),
    )
    .max(6)
    .refine((steps) => new Set(steps.map((step) => step.id)).size === steps.length),
  partialByPosition: z.boolean(),
  rationaleGeneral: z.string().max(10_000),
});

export function parseOrderedResponseDraft(
  input: unknown,
): DraftParseResult<OrderedResponseFormValues> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as OrderedResponseFormValues };
}
