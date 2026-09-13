import { z } from "zod";
import { ehrTabKindSchema, idSchema } from "@/lib/ngn/schemas";
import { DRAFT_ERROR, type DraftParseResult } from "./draft";
import { EHR_LIMITS, type EhrFormValues } from "./ehr";

const text = (max: number) => z.string().max(max);

const blockDraftSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("markdown"), value: text(20_000) }),
  z.strictObject({
    kind: z.literal("table"),
    columns: z.array(text(200)).max(EHR_LIMITS.tableColumns),
    rows: z.array(z.array(text(1_000)).max(EHR_LIMITS.tableColumns)).max(EHR_LIMITS.tableRows),
  }),
  z.strictObject({
    kind: z.literal("vitals"),
    rows: z
      .array(
        z.strictObject({
          label: text(200),
          value: text(200),
          unit: text(100),
          flag: z.enum(["", "H", "L"]),
        }),
      )
      .max(EHR_LIMITS.vitalsRows),
  }),
]);

/**
 * What Save accepts for a record: every field typed and size-limited, nothing extra. Item draft
 * schemas use it too, for a record on a standalone item.
 */
export const ehrFormDraftSchema = z.strictObject({
  patient: z.strictObject({
    name: text(200),
    age: text(10),
    sex: z.enum(["", "female", "male", "other"]),
    setting: text(200),
    admissionDate: text(100),
  }),
  timePoints: z
    .array(z.strictObject({ id: idSchema, label: text(100) }))
    .min(1)
    .max(EHR_LIMITS.timePoints),
  tabs: z
    .array(
      z.strictObject({
        id: idSchema,
        kind: ehrTabKindSchema,
        title: text(200),
        timePointId: z.union([z.literal(""), idSchema]),
        blocks: z.array(blockDraftSchema).max(EHR_LIMITS.blocks),
      }),
    )
    .max(EHR_LIMITS.tabs),
});

export function parseEhrDraft(input: unknown): DraftParseResult<EhrFormValues> {
  const parsed = ehrFormDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: DRAFT_ERROR };
  return { ok: true, values: parsed.data as EhrFormValues };
}
