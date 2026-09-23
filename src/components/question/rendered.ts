import type { ItemType } from "@/lib/ngn/labels";

/**
 * Item types that have a renderer. A plain list, so the gallery nav and the playground can tell a
 * built type from one still to come without importing the renderer registry, which would pull every
 * renderer's chunk into their bundles (#54). `registry.test.ts` holds it in step with `RENDERERS`.
 */
export const RENDERED_TYPES: readonly ItemType[] = [
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
];

export function hasRenderer(type: ItemType): boolean {
  return RENDERED_TYPES.includes(type);
}
