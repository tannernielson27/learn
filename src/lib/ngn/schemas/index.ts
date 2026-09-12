import { z } from "zod";
import { ITEM_TYPES, type ItemType } from "../labels";
import { ehrRecordSchema, idSchema } from "./common";
import {
  dragdropClozeItemSchema,
  dragdropClozeResponseSchema,
  dragdropRationaleItemSchema,
  dragdropRationaleResponseSchema,
  dropdownClozeItemSchema,
  dropdownClozeResponseSchema,
  dropdownRationaleItemSchema,
  dropdownRationaleResponseSchema,
  dropdownTableItemSchema,
  dropdownTableResponseSchema,
} from "./cloze";
import {
  matrixMultipleChoiceItemSchema,
  matrixMultipleChoiceResponseSchema,
  matrixMultipleResponseItemSchema,
  matrixMultipleResponseResponseSchema,
  multipleChoiceItemSchema,
  multipleChoiceResponseSchema,
  multipleResponseGroupingItemSchema,
  multipleResponseGroupingResponseSchema,
  multipleResponseItemSchema,
  multipleResponseResponseSchema,
} from "./selection";
import {
  bowtieItemSchema,
  bowtieResponseSchema,
  highlightTableItemSchema,
  highlightTableResponseSchema,
  highlightTextItemSchema,
  highlightTextResponseSchema,
  orderedResponseItemSchema,
  orderedResponseResponseSchema,
} from "./structured";

export * from "./common";
export * from "./selection";
export * from "./cloze";
export * from "./structured";

// Defined in the zod-free labels module so client code can list types without the schemas.
export { ITEM_TYPES, type ItemType };

/**
 * Item schemas carry refinements, so they cannot be members of a discriminated union.
 * `itemSchema` is a thin dispatcher: it reads `type`, then parses with the matching schema.
 */
export const ITEM_SCHEMAS = {
  multiple_choice: multipleChoiceItemSchema,
  multiple_response: multipleResponseItemSchema,
  multiple_response_grouping: multipleResponseGroupingItemSchema,
  matrix_multiple_choice: matrixMultipleChoiceItemSchema,
  matrix_multiple_response: matrixMultipleResponseItemSchema,
  dropdown_cloze: dropdownClozeItemSchema,
  dropdown_rationale: dropdownRationaleItemSchema,
  dropdown_table: dropdownTableItemSchema,
  highlight_text: highlightTextItemSchema,
  highlight_table: highlightTableItemSchema,
  dragdrop_cloze: dragdropClozeItemSchema,
  dragdrop_rationale: dragdropRationaleItemSchema,
  ordered_response: orderedResponseItemSchema,
  bowtie: bowtieItemSchema,
} as const;

export type ItemOf<T extends ItemType> = z.infer<(typeof ITEM_SCHEMAS)[T]>;
export type Item = { [T in ItemType]: ItemOf<T> }[ItemType];
/** Authoring-side input shape (before defaults are applied). */
export type ItemInputOf<T extends ItemType> = z.input<(typeof ITEM_SCHEMAS)[T]>;
export type ItemInput = { [T in ItemType]: ItemInputOf<T> }[ItemType];

const typeProbe = z.object({ type: z.enum(ITEM_TYPES) });

export const itemSchema = z.custom<ItemInput>().transform((input, ctx) => {
  const probe = typeProbe.safeParse(input);
  if (!probe.success) {
    ctx.addIssue({ code: "custom", message: "unknown or missing item type", path: ["type"] });
    return z.NEVER;
  }
  const parsed = ITEM_SCHEMAS[probe.data.type].safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ code: "custom", message: issue.message, path: [...issue.path] });
    }
    return z.NEVER;
  }
  return parsed.data as Item;
});

export const responseSchema = z.discriminatedUnion("type", [
  multipleChoiceResponseSchema,
  multipleResponseResponseSchema,
  multipleResponseGroupingResponseSchema,
  matrixMultipleChoiceResponseSchema,
  matrixMultipleResponseResponseSchema,
  dropdownClozeResponseSchema,
  dropdownRationaleResponseSchema,
  dropdownTableResponseSchema,
  highlightTextResponseSchema,
  highlightTableResponseSchema,
  dragdropClozeResponseSchema,
  dragdropRationaleResponseSchema,
  orderedResponseResponseSchema,
  bowtieResponseSchema,
]);
export type AnyResponse = z.infer<typeof responseSchema>;
export type ResponseOf<T extends ItemType> = Extract<AnyResponse, { type: T }>;

// ---------------------------------------------------------------------------
// Case study: exactly six items, one per CJMM step, in order
// ---------------------------------------------------------------------------

export const caseStudySchema = z
  .object({
    id: idSchema,
    title: z.string().min(1),
    tags: z.array(z.string()).default([]),
    ehr: ehrRecordSchema,
    items: z.array(itemSchema).length(6, "a case study has exactly six items"),
  })
  .superRefine((cs, ctx) => {
    cs.items.forEach((item, index) => {
      if (item.cjmmStep !== index + 1) {
        ctx.addIssue({
          code: "custom",
          message: `item ${index + 1} must have cjmmStep ${index + 1}`,
          path: ["items", index, "cjmmStep"],
        });
      }
    });
  });
export type CaseStudy = z.infer<typeof caseStudySchema>;
