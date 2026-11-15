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
  multiple_choice: "Multiple choice",
  multiple_response: "Extended multiple response",
  multiple_response_grouping: "Multiple response grouping",
  matrix_multiple_choice: "Matrix multiple choice",
  matrix_multiple_response: "Matrix multiple response",
  dropdown_cloze: "Drop-down cloze",
  dropdown_rationale: "Drop-down rationale",
  dropdown_table: "Drop-down table",
  highlight_text: "Highlight text",
  highlight_table: "Highlight table",
  dragdrop_cloze: "Drag-and-drop cloze",
  dragdrop_rationale: "Drag-and-drop rationale",
  ordered_response: "Ordered response",
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
      "Each correct selection earns one point and each incorrect selection removes one. A score never goes below zero; where rows are scored separately, each row stops at zero on its own.",
  },
  rationale: {
    name: "Rationale scoring",
    explanation:
      "Linked blanks are scored together: a pair earns its point only when both are correct, and a triad scores nothing unless its anchor is correct.",
  },
};
