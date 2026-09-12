import type { ScoringModel } from "./types";

/**
 * Item type names and scoring labels, kept free of zod so client components (the question shell,
 * the gallery nav) can import them without pulling every item schema into the browser bundle.
 */
export const ITEM_TYPES = [
  "multiple_choice",
  "multiple_response",
  "multiple_response_grouping",
  "matrix_multiple_choice",
  "matrix_multiple_response",
  "dropdown_cloze",
  "dropdown_rationale",
  "dropdown_table",
  "highlight_text",
  "highlight_table",
  "dragdrop_cloze",
  "dragdrop_rationale",
  "ordered_response",
  "bowtie",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  multiple_choice: "Multiple Choice",
  multiple_response: "Extended Multiple Response",
  multiple_response_grouping: "Multiple Response Grouping",
  matrix_multiple_choice: "Matrix Multiple Choice",
  matrix_multiple_response: "Matrix Multiple Response",
  dropdown_cloze: "Drop-Down Cloze",
  dropdown_rationale: "Drop-Down Rationale",
  dropdown_table: "Drop-Down Table",
  highlight_text: "Highlight Text",
  highlight_table: "Highlight Table",
  dragdrop_cloze: "Drag-and-Drop Cloze",
  dragdrop_rationale: "Drag-and-Drop Rationale",
  ordered_response: "Ordered Response",
  bowtie: "Bowtie",
};

export const SCORING_MODEL_LABELS: Record<ScoringModel, { name: string; explanation: string }> = {
  zero_one: {
    name: "0/1 scoring",
    explanation: "Each part earns one point when correct and zero when incorrect.",
  },
  plus_minus: {
    name: "+/- scoring",
    explanation:
      "Each correct selection earns one point and each incorrect selection removes one; the item score cannot go below zero.",
  },
  rationale: {
    name: "Rationale scoring",
    explanation:
      "Linked blanks are scored together: a pair earns its point only when both are correct, and a triad scores nothing unless its anchor is correct.",
  },
};
