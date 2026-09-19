import { z } from "zod";
import { ehrFormDraftSchema } from "./ehrDraft";
import { cjmmStepSchema, idSchema, itemMetaSchema } from "@/lib/ngn/schemas";
import { draftTagsSchema } from "./draftTags";
import type { ClozeFormValues } from "./cloze";
import { DRAFT_ERROR, type DraftParseResult } from "./draft";

/**
 * What Save draft accepts for drop-down cloze or rationale: blank text allowed, every field typed
 * and size-limited, unknown fields refused, blanks and choices capped at the schemas' maximums
 * (3 blanks, 5 choices each).
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
  sentence: z.string().max(20_000),
  blanks: z
    .array(
      z.strictObject({
        id: idSchema,
        choices: z.array(z.strictObject({ id: idSchema, label: z.string().max(2_000) })).max(5),
        correctChoiceId: z.string().max(64),
        rationale: z.string().max(5_000),
      }),
    )
    .max(3),
  anchorBlankId: z.string().max(64),
  rationaleGeneral: z.string().max(10_000),
});

export function parseClozeDraft(input: unknown): DraftParseResult<ClozeFormValues> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as ClozeFormValues };
}
