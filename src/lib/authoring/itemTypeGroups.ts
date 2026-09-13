import type { ItemType } from "@/lib/ngn/labels";

export interface ItemTypeGroup {
  label: string;
  types: readonly ItemType[];
}

/** How the "New item" picker groups the formats, in the order authors reach for them. */
export const ITEM_TYPE_GROUPS: readonly ItemTypeGroup[] = [
  {
    label: "Selection",
    types: ["multiple_choice", "multiple_response", "multiple_response_grouping"],
  },
  { label: "Matrix", types: ["matrix_multiple_choice", "matrix_multiple_response"] },
  { label: "Drop-down", types: ["dropdown_cloze", "dropdown_rationale", "dropdown_table"] },
  { label: "Highlight", types: ["highlight_text", "highlight_table"] },
  {
    label: "Drag and drop",
    types: ["dragdrop_cloze", "dragdrop_rationale", "ordered_response", "bowtie"],
  },
];

/** Types with a shipped editor (#69 to #71, #82, #83); the rest arrive later in Sprint 5. */
export const EDITOR_READY_TYPES: ReadonlySet<ItemType> = new Set<ItemType>([
  "dragdrop_cloze",
  "dragdrop_rationale",
  "highlight_text",
  "highlight_table",
  "multiple_choice",
  "multiple_response",
  "multiple_response_grouping",
  "matrix_multiple_choice",
  "matrix_multiple_response",
  "dropdown_cloze",
  "dropdown_rationale",
  "dropdown_table",
]);

export function isEditorReady(type: ItemType): boolean {
  return EDITOR_READY_TYPES.has(type);
}
