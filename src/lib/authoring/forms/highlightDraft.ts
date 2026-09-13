import { z } from "zod";
import { cjmmStepSchema, ehrRecordSchema, idSchema, itemMetaSchema } from "@/lib/ngn/schemas";
import type { HighlightTableFormValues, HighlightTextFormValues } from "./highlight";
import { DRAFT_ERROR, type DraftParseResult } from "./draft";

// Enough for any real passage; a draft with more span notes than this is not a highlight item.
const MAX_SPANS = 200;

const base = {
  id: idSchema,
  version: z.number().int().min(1),
  tags: z.array(z.string().max(60)).max(30),
  cjmmStep: cjmmStepSchema.optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  ehr: ehrRecordSchema.optional(),
  meta: itemMetaSchema,
  stem: z.string().max(20_000),
  instructions: z.string().max(2_000),
  correctSpanIds: z.array(idSchema).max(MAX_SPANS),
  spanRationales: z
    .record(idSchema, z.string().max(5_000))
    .refine((notes) => Object.keys(notes).length <= MAX_SPANS),
  rationaleGeneral: z.string().max(10_000),
};

/** What Save draft accepts for highlight text: every field typed and size-limited, nothing extra. */
const textDraftSchema = z.strictObject({ ...base, passage: z.string().max(20_000) });

/** The same for highlight table, capped at the schema's 4 columns and 8 rows. */
const tableDraftSchema = z.strictObject({
  ...base,
  columns: z.array(z.strictObject({ label: z.string().max(200) })).max(4),
  rows: z
    .array(
      z.strictObject({
        id: idSchema,
        cells: z.array(z.strictObject({ text: z.string().max(5_000) })).max(4),
      }),
    )
    .max(8),
  scorePerRow: z.boolean(),
});

export function parseHighlightTextDraft(input: unknown): DraftParseResult<HighlightTextFormValues> {
  const parsed = textDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as HighlightTextFormValues };
}

export function parseHighlightTableDraft(
  input: unknown,
): DraftParseResult<HighlightTableFormValues> {
  const parsed = tableDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as HighlightTableFormValues };
}
