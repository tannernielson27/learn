import { z } from "zod";
import { ehrFormDraftSchema } from "./ehrDraft";
import { cjmmStepSchema, idSchema, itemMetaSchema } from "@/lib/ngn/schemas";
import { draftTagsSchema } from "./draftTags";
import type { MultipleChoiceFormValues } from "./multipleChoice";

export type DraftParseResult =
  { ok: true; values: MultipleChoiceFormValues } | { ok: false; error: string };

const DRAFT_ERROR =
  "The draft could not be saved because part of it is not valid. Reload the page and try again.";

/**
 * What Save draft accepts from the browser. Blank text is allowed, because a draft may be
 * incomplete, but every field has a type and a size limit, and unknown fields are refused, so a
 * forged request cannot slip an answer key or oversized payload past the form.
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
  options: z
    .array(
      z.strictObject({
        id: idSchema,
        label: z.string().max(2_000),
        rationale: z.string().max(5_000),
      }),
    )
    .max(6),
  correctOptionId: z.string().max(64),
  rationaleGeneral: z.string().max(10_000),
});

export function parseMultipleChoiceDraft(input: unknown): DraftParseResult {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as MultipleChoiceFormValues };
}
