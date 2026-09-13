import { z } from "zod";
import { ehrFormDraftSchema } from "./ehrDraft";
import { cjmmStepSchema, idSchema, itemMetaSchema, rationaleSchema } from "@/lib/ngn/schemas";
import { DRAFT_ERROR, type DraftParseResult } from "./draft";
import type { GroupingFormValues } from "./multipleResponseGrouping";

/**
 * What Save draft accepts for a multiple response grouping item: blank text allowed, every field
 * typed and size-limited, unknown fields refused. Group and option counts stop at the schema's
 * maximums (8 groups, 4 options each).
 */
const draftSchema = z.strictObject({
  id: idSchema,
  version: z.number().int().min(1),
  tags: z.array(z.string().max(60)).max(30),
  cjmmStep: cjmmStepSchema.optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  ehr: ehrFormDraftSchema.optional(),
  meta: itemMetaSchema,
  rationale: rationaleSchema,
  stem: z.string().max(20_000),
  instructions: z.string().max(2_000),
  rows: z
    .array(
      z.strictObject({
        id: idSchema,
        label: z.string().max(2_000),
        options: z
          .array(
            z.strictObject({
              id: idSchema,
              label: z.string().max(2_000),
              correct: z.boolean(),
            }),
          )
          .max(4),
      }),
    )
    .max(8),
});

export function parseGroupingDraft(input: unknown): DraftParseResult<GroupingFormValues> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as GroupingFormValues };
}
