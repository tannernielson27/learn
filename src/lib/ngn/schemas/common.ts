import { z } from "zod";

/** Stable identifier: letters, digits, underscore, hyphen. */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "invalid id");

export const richTextSchema = z.object({
  kind: z.literal("markdown"),
  value: z.string().min(1, "text is required"),
});
export type RichText = z.infer<typeof richTextSchema>;

export const cjmmStepSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const scoringModelSchema = z.enum(["zero_one", "plus_minus", "rationale"]);

/** A selectable option / row / column / token with a display label. */
export const labeledSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
});
export type Labeled = z.infer<typeof labeledSchema>;

// ---------------------------------------------------------------------------
// Electronic health record (fictional content only)
// ---------------------------------------------------------------------------

const markdownBlockSchema = z.object({ kind: z.literal("markdown"), value: z.string().min(1) });

const tableBlockSchema = z.object({
  kind: z.literal("table"),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())).min(1),
});

const vitalsBlockSchema = z.object({
  kind: z.literal("vitals"),
  rows: z
    .array(
      z.object({
        label: z.string().min(1),
        value: z.string().min(1),
        unit: z.string().optional(),
        flag: z.enum(["H", "L"]).optional(),
      }),
    )
    .min(1),
});

export const ehrBlockSchema = z.discriminatedUnion("kind", [
  markdownBlockSchema,
  tableBlockSchema,
  vitalsBlockSchema,
]);
export type EhrBlock = z.infer<typeof ehrBlockSchema>;

export const ehrTabKindSchema = z.enum([
  "history_physical",
  "nurses_notes",
  "vital_signs",
  "lab_results",
  "orders",
  "mar",
  "diagnostics",
  "custom",
]);

export const ehrTabSchema = z.object({
  id: idSchema,
  kind: ehrTabKindSchema,
  title: z.string().min(1),
  blocks: z.array(ehrBlockSchema).min(1),
  timePointId: idSchema.optional(),
});

export const ehrRecordSchema = z.object({
  patientHeader: z.object({
    name: z.string().optional(),
    age: z.number().int().min(0).max(120),
    sex: z.enum(["female", "male", "other"]),
    setting: z.string().min(1),
    admissionDate: z.string().optional(),
  }),
  timePoints: z.array(labeledSchema).min(1),
  tabs: z.array(ehrTabSchema).min(1),
});
export type EhrRecord = z.infer<typeof ehrRecordSchema>;

// ---------------------------------------------------------------------------
// Item envelope (shared by every item type)
// ---------------------------------------------------------------------------

export const rationaleSchema = z.object({
  general: richTextSchema.optional(),
  perElement: z.record(z.string(), richTextSchema).optional(),
});

export const scoringMetaSchema = z.object({
  model: scoringModelSchema,
  maxPoints: z.number().int().min(1),
});

export const itemMetaSchema = z.object({
  author: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  sourceNote: z.string().optional(),
});

export const envelopeFields = {
  id: idSchema,
  version: z.number().int().min(1).default(1),
  cjmmStep: cjmmStepSchema.optional(),
  tags: z.array(z.string()).default([]),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  stem: richTextSchema,
  instructions: z.string().optional(),
  ehr: ehrRecordSchema.optional(),
  rationale: rationaleSchema.default({}),
  scoring: scoringMetaSchema,
  meta: itemMetaSchema.default({}),
};

/** Token stream used by cloze-style stems. */
export const clozeTokenSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({ kind: z.literal("blank"), blankId: idSchema }),
]);
export type ClozeToken = z.infer<typeof clozeTokenSchema>;

/** Utility: ids in an array are unique. */
export const uniqueIds = (ids: readonly string[]): boolean => new Set(ids).size === ids.length;

/** Utility: every id in `subset` appears in `all`. */
export const subsetOf = (subset: readonly string[], all: readonly string[]): boolean => {
  const set = new Set(all);
  return subset.every((id) => set.has(id));
};

/** Blank ids present in a token stream, in order. */
export const blankIdsOf = (tokens: readonly ClozeToken[]): string[] =>
  tokens.flatMap((t) => (t.kind === "blank" ? [t.blankId] : []));
