import { z } from "zod";
import { ehrFormDraftSchema } from "./ehrDraft";
import { cjmmStepSchema, idSchema, itemMetaSchema } from "@/lib/ngn/schemas";
import { draftTagsSchema } from "./draftTags";
import { DRAFT_ERROR, type DraftParseResult } from "./draft";
import type { MultipleResponseFormValues } from "./multipleResponse";

/**
 * What Save draft accepts for a multiple response item. Blank text is allowed, because a draft
 * may be incomplete, but every field has a type and a size limit and unknown fields are refused.
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
  variant: z.enum(["sata", "select_n"]),
  // Null while the field is blank; NaN is never accepted.
  n: z.number().int().min(1).max(9).nullable(),
  options: z
    .array(
      z.strictObject({
        id: idSchema,
        label: z.string().max(2_000),
        correct: z.boolean(),
        rationale: z.string().max(5_000),
      }),
    )
    .max(10),
  rationaleGeneral: z.string().max(10_000),
});

export function parseMultipleResponseDraft(
  input: unknown,
): DraftParseResult<MultipleResponseFormValues> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as MultipleResponseFormValues };
}
