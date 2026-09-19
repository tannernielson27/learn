import { z } from "zod";
import { ehrFormDraftSchema } from "./ehrDraft";
import { cjmmStepSchema, idSchema, itemMetaSchema } from "@/lib/ngn/schemas";
import { draftTagsSchema } from "./draftTags";
import { DRAFT_ERROR, type DraftParseResult } from "./draft";
import type { MatrixFormValues } from "./matrix";

/**
 * What Save draft accepts for either matrix type: blank text allowed, every field typed and
 * size-limited, unknown fields refused, and rows and columns capped at the schema's maximums
 * (8 rows, 4 columns). The item-level byte cap in the Server Action covers the rest.
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
  rows: z
    .array(
      z.strictObject({
        id: idSchema,
        label: z.string().max(2_000),
        correctColumnIds: z.array(idSchema).max(4),
        rationale: z.string().max(5_000),
      }),
    )
    .max(8),
  columns: z.array(z.strictObject({ id: idSchema, label: z.string().max(2_000) })).max(4),
  rationaleGeneral: z.string().max(10_000),
});

export function parseMatrixDraft(input: unknown): DraftParseResult<MatrixFormValues> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as MatrixFormValues };
}
