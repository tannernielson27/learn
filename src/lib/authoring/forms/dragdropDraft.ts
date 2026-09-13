import { z } from "zod";
import { cjmmStepSchema, ehrRecordSchema, idSchema, itemMetaSchema } from "@/lib/ngn/schemas";
import type { DragDropFormValues } from "./dragdrop";
import { DRAFT_ERROR, type DraftParseResult } from "./draft";

const uniqueIds = (entries: readonly { id: string }[]) =>
  new Set(entries.map((entry) => entry.id)).size === entries.length;

/**
 * What Save draft accepts for drag-and-drop cloze or rationale: every field typed and
 * size-limited, unknown fields refused, capped at the schemas' 3 blanks and 8 words.
 */
const draftSchema = z.strictObject({
  id: idSchema,
  version: z.number().int().min(1),
  tags: z.array(z.string().max(60)).max(30),
  cjmmStep: cjmmStepSchema.optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  ehr: ehrRecordSchema.optional(),
  meta: itemMetaSchema,
  stem: z.string().max(20_000),
  instructions: z.string().max(2_000),
  sentence: z.string().max(20_000),
  blanks: z
    .array(
      z.strictObject({
        id: idSchema,
        correctTokenId: z.string().max(64),
        rationale: z.string().max(5_000),
      }),
    )
    .max(3)
    .refine(uniqueIds),
  // Repeated ids would make a reopened draft's answer choices ambiguous.
  bank: z
    .array(z.strictObject({ id: idSchema, label: z.string().max(2_000) }))
    .max(8)
    .refine(uniqueIds),
  reusable: z.boolean(),
  anchorBlankId: z.string().max(64),
  rationaleGeneral: z.string().max(10_000),
});

export function parseDragDropDraft(input: unknown): DraftParseResult<DragDropFormValues> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as DragDropFormValues };
}
