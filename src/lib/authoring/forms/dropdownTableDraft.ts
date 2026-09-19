import { z } from "zod";
import { ehrFormDraftSchema } from "./ehrDraft";
import { cjmmStepSchema, idSchema, itemMetaSchema, rationaleSchema } from "@/lib/ngn/schemas";
import { draftTagsSchema } from "./draftTags";
import { DRAFT_ERROR, type DraftParseResult } from "./draft";
import type { DropdownTableFormValues } from "./dropdownTable";

/**
 * What Save draft accepts for a drop-down table: blank text allowed, every field typed and
 * size-limited, unknown fields refused, rows and choices capped at the schema's maximums
 * (8 rows, 6 choices each).
 */
const draftSchema = z.strictObject({
  id: idSchema,
  version: z.number().int().min(1),
  tags: draftTagsSchema,
  cjmmStep: cjmmStepSchema.optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  ehr: ehrFormDraftSchema.optional(),
  meta: itemMetaSchema,
  rationale: rationaleSchema,
  stem: z.string().max(20_000),
  instructions: z.string().max(2_000),
  columnLabel: z.string().max(2_000),
  dropdownLabel: z.string().max(2_000),
  rows: z
    .array(
      z.strictObject({
        id: idSchema,
        label: z.string().max(2_000),
        choices: z.array(z.strictObject({ id: idSchema, label: z.string().max(2_000) })).max(6),
        correctChoiceId: z.string().max(64),
      }),
    )
    .max(8),
});

export function parseDropdownTableDraft(input: unknown): DraftParseResult<DropdownTableFormValues> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as DropdownTableFormValues };
}
