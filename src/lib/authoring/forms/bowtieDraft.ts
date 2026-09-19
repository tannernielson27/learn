import { z } from "zod";
import { ehrFormDraftSchema } from "./ehrDraft";
import { cjmmStepSchema, idSchema, itemMetaSchema } from "@/lib/ngn/schemas";
import { draftTagsSchema } from "./draftTags";
import type { BowtieFormValues } from "./bowtie";
import { DRAFT_ERROR, type DraftParseResult } from "./draft";

const choice = z.strictObject({ id: idSchema, label: z.string().max(2_000), correct: z.boolean() });

/**
 * What Save draft accepts for a bowtie. Column sizes are fixed by the format, so a draft must
 * already have five actions, four conditions and five parameters, with no id repeated anywhere.
 */
const draftSchema = z
  .strictObject({
    id: idSchema,
    version: z.number().int().min(1),
    tags: draftTagsSchema,
    cjmmStep: cjmmStepSchema.optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    ehr: ehrFormDraftSchema.optional(),
    meta: itemMetaSchema,
    stem: z.string().max(20_000),
    instructions: z.string().max(2_000),
    actions: z.array(choice).length(5),
    conditions: z.array(z.strictObject({ id: idSchema, label: z.string().max(2_000) })).length(4),
    conditionId: z.string().max(64),
    parameters: z.array(choice).length(5),
    columnLabels: z.strictObject({
      actions: z.string().max(200),
      condition: z.string().max(200),
      parameters: z.string().max(200),
    }),
    rationaleGeneral: z.string().max(10_000),
  })
  .refine((values) => {
    const ids = [...values.actions, ...values.conditions, ...values.parameters].map((c) => c.id);
    return new Set(ids).size === ids.length;
  });

export function parseBowtieDraft(input: unknown): DraftParseResult<BowtieFormValues> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as BowtieFormValues };
}
