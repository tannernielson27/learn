import { z } from "zod";
import {
  blankIdsOf,
  clozeTokenSchema,
  envelopeFields,
  idSchema,
  labeledSchema,
  subsetOf,
  uniqueIds,
} from "./common";

/** A blank with its own choice list (drop-down family). */
const dropdownBlankSchema = z.object({
  id: idSchema,
  choices: z.array(labeledSchema).min(3).max(5),
});

const blankKeySchema = z.object({ blankId: idSchema, correctChoiceId: idSchema });
const blankResponseSchema = z.object({ blankId: idSchema, choiceId: idSchema });

type ClozeLike = {
  content: {
    tokens: z.infer<typeof clozeTokenSchema>[];
    blanks: { id: string; choices?: { id: string }[] }[];
  };
  answerKey: {
    blanks: { blankId: string; correctChoiceId?: string; correctTokenId?: string }[];
    anchorBlankId?: string;
  };
};

/** Shared refinement: blanks in tokens, blank definitions and answer key all line up. */
function refineCloze(
  i: ClozeLike,
  ctx: z.RefinementCtx,
  opts: { min: number; max: number; rationale: boolean },
) {
  const tokenBlankIds = blankIdsOf(i.content.tokens);
  const blankIds = i.content.blanks.map((b) => b.id);
  if (tokenBlankIds.length < opts.min || tokenBlankIds.length > opts.max) {
    ctx.addIssue({
      code: "custom",
      message: `expected ${opts.min}–${opts.max} blanks`,
      path: ["content", "tokens"],
    });
  }
  if (
    !uniqueIds(tokenBlankIds) ||
    !uniqueIds(blankIds) ||
    tokenBlankIds.length !== blankIds.length ||
    !subsetOf(tokenBlankIds, blankIds)
  ) {
    ctx.addIssue({
      code: "custom",
      message: "tokens and blanks must define the same ids once",
      path: ["content", "blanks"],
    });
  }
  const keyIds = i.answerKey.blanks.map((b) => b.blankId);
  if (keyIds.length !== blankIds.length || !uniqueIds(keyIds) || !subsetOf(keyIds, blankIds)) {
    ctx.addIssue({
      code: "custom",
      message: "answer key must cover every blank exactly once",
      path: ["answerKey"],
    });
  }
  for (const k of i.answerKey.blanks) {
    const blank = i.content.blanks.find((b) => b.id === k.blankId);
    if (
      blank?.choices &&
      k.correctChoiceId &&
      !blank.choices.some((c) => c.id === k.correctChoiceId)
    ) {
      ctx.addIssue({
        code: "custom",
        message: `blank ${k.blankId}: correct choice must exist`,
        path: ["answerKey"],
      });
    }
  }
  if (opts.rationale) {
    if (
      tokenBlankIds.length === 3 &&
      (!i.answerKey.anchorBlankId || !blankIds.includes(i.answerKey.anchorBlankId))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "triad requires anchorBlankId",
        path: ["answerKey", "anchorBlankId"],
      });
    }
  }
}

// ---------------------------------------------------------------------------
// dropdown_cloze
// ---------------------------------------------------------------------------

export const dropdownClozeContentSchema = z.object({
  tokens: z.array(clozeTokenSchema).min(1),
  blanks: z.array(dropdownBlankSchema).min(1).max(3),
});
export const dropdownClozeAnswerKeySchema = z.object({ blanks: z.array(blankKeySchema).min(1) });
export const dropdownClozeResponseSchema = z.object({
  type: z.literal("dropdown_cloze"),
  blanks: z.array(blankResponseSchema).default([]),
});
export const dropdownClozeItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("dropdown_cloze"),
    content: dropdownClozeContentSchema,
    answerKey: dropdownClozeAnswerKeySchema,
  })
  .superRefine((i, ctx) => refineCloze(i, ctx, { min: 1, max: 3, rationale: false }));

// ---------------------------------------------------------------------------
// dropdown_rationale (dyad / triad)
// ---------------------------------------------------------------------------

export const dropdownRationaleContentSchema = z.object({
  tokens: z.array(clozeTokenSchema).min(1),
  blanks: z.array(dropdownBlankSchema).min(2).max(3),
});
export const dropdownRationaleAnswerKeySchema = z.object({
  blanks: z.array(blankKeySchema).min(2).max(3),
  anchorBlankId: idSchema.optional(),
});
export const dropdownRationaleResponseSchema = z.object({
  type: z.literal("dropdown_rationale"),
  blanks: z.array(blankResponseSchema).default([]),
});
export const dropdownRationaleItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("dropdown_rationale"),
    content: dropdownRationaleContentSchema,
    answerKey: dropdownRationaleAnswerKeySchema,
  })
  .superRefine((i, ctx) => refineCloze(i, ctx, { min: 2, max: 3, rationale: true }));

// ---------------------------------------------------------------------------
// dropdown_table
// ---------------------------------------------------------------------------

export const dropdownTableContentSchema = z.object({
  columns: z.object({ label: z.string().min(1), dropdown: z.string().min(1) }),
  rows: z
    .array(
      z.object({
        id: idSchema,
        label: z.string().min(1),
        choices: z.array(labeledSchema).min(2).max(6),
      }),
    )
    .min(2)
    .max(8),
});
export const dropdownTableAnswerKeySchema = z.object({
  rows: z.array(z.object({ rowId: idSchema, correctChoiceId: idSchema })).min(1),
});
export const dropdownTableResponseSchema = z.object({
  type: z.literal("dropdown_table"),
  rows: z.array(z.object({ rowId: idSchema, choiceId: idSchema })).default([]),
});
export const dropdownTableItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("dropdown_table"),
    content: dropdownTableContentSchema,
    answerKey: dropdownTableAnswerKeySchema,
  })
  .superRefine((i, ctx) => {
    const rowIds = i.content.rows.map((r) => r.id);
    const keyRows = i.answerKey.rows.map((r) => r.rowId);
    if (keyRows.length !== rowIds.length || !uniqueIds(keyRows) || !subsetOf(keyRows, rowIds)) {
      ctx.addIssue({
        code: "custom",
        message: "answer key must cover every row exactly once",
        path: ["answerKey"],
      });
    }
    for (const k of i.answerKey.rows) {
      const row = i.content.rows.find((r) => r.id === k.rowId);
      if (row && !row.choices.some((c) => c.id === k.correctChoiceId)) {
        ctx.addIssue({
          code: "custom",
          message: `row ${k.rowId}: correct choice must exist`,
          path: ["answerKey"],
        });
      }
    }
  });

// ---------------------------------------------------------------------------
// dragdrop_cloze / dragdrop_rationale (shared word bank)
// ---------------------------------------------------------------------------

const dragDropContent = {
  tokens: z.array(clozeTokenSchema).min(1),
  blanks: z
    .array(z.object({ id: idSchema }))
    .min(1)
    .max(3),
  bank: z.array(labeledSchema).min(4).max(8),
  reusable: z.boolean().default(false),
};
const tokenKeySchema = z.object({ blankId: idSchema, correctTokenId: idSchema });
const tokenResponseSchema = z.object({ blankId: idSchema, tokenId: idSchema });

// A single-use bank that keys one token to two blanks can never score full marks: once placed,
// the token is gone from the bank.
function refineBank(
  i: {
    content: { bank: { id: string }[]; reusable: boolean };
    answerKey: { blanks: { correctTokenId: string }[] };
  },
  ctx: z.RefinementCtx,
) {
  const bankIds = i.content.bank.map((b) => b.id);
  if (
    !uniqueIds(bankIds) ||
    !subsetOf(
      i.answerKey.blanks.map((b) => b.correctTokenId),
      bankIds,
    )
  ) {
    ctx.addIssue({
      code: "custom",
      message: "correct tokens must exist in the bank",
      path: ["answerKey"],
    });
  }
  if (i.content.reusable) return;
  const keyed = new Set<string>();
  i.answerKey.blanks.forEach((b, index) => {
    if (keyed.has(b.correctTokenId)) {
      ctx.addIssue({
        code: "custom",
        message: "a single-use bank needs a different correct token for each blank",
        path: ["answerKey", "blanks", index, "correctTokenId"],
      });
    }
    keyed.add(b.correctTokenId);
  });
}

export const dragdropClozeContentSchema = z.object(dragDropContent);
export const dragdropClozeAnswerKeySchema = z.object({ blanks: z.array(tokenKeySchema).min(1) });
export const dragdropClozeResponseSchema = z.object({
  type: z.literal("dragdrop_cloze"),
  blanks: z.array(tokenResponseSchema).default([]),
});
export const dragdropClozeItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("dragdrop_cloze"),
    content: dragdropClozeContentSchema,
    answerKey: dragdropClozeAnswerKeySchema,
  })
  .superRefine((i, ctx) => {
    refineCloze(i, ctx, { min: 1, max: 3, rationale: false });
    refineBank(i, ctx);
  });

export const dragdropRationaleContentSchema = z.object({
  ...dragDropContent,
  blanks: z
    .array(z.object({ id: idSchema }))
    .min(2)
    .max(3),
});
export const dragdropRationaleAnswerKeySchema = z.object({
  blanks: z.array(tokenKeySchema).min(2).max(3),
  anchorBlankId: idSchema.optional(),
});
export const dragdropRationaleResponseSchema = z.object({
  type: z.literal("dragdrop_rationale"),
  blanks: z.array(tokenResponseSchema).default([]),
});
export const dragdropRationaleItemSchema = z
  .object({
    ...envelopeFields,
    type: z.literal("dragdrop_rationale"),
    content: dragdropRationaleContentSchema,
    answerKey: dragdropRationaleAnswerKeySchema,
  })
  .superRefine((i, ctx) => {
    refineCloze(i, ctx, { min: 2, max: 3, rationale: true });
    refineBank(i, ctx);
  });
