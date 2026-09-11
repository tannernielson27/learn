import type { ItemType } from "@/lib/ngn/schemas";
import { dragdropClozeModule } from "./dragdrop_cloze/DragdropClozeItem";
import { dragdropRationaleModule } from "./dragdrop_rationale/DragdropRationaleItem";
import { dropdownClozeModule } from "./dropdown_cloze/DropdownClozeItem";
import { dropdownRationaleModule } from "./dropdown_rationale/DropdownRationaleItem";
import { dropdownTableModule } from "./dropdown_table/DropdownTableItem";
import { highlightTableModule } from "./highlight_table/HighlightTableItem";
import { highlightTextModule } from "./highlight_text/HighlightTextItem";
import { matrixMultipleChoiceModule } from "./matrix_multiple_choice/MatrixMultipleChoiceItem";
import { matrixMultipleResponseModule } from "./matrix_multiple_response/MatrixMultipleResponseItem";
import { multipleChoiceModule } from "./multiple_choice/MultipleChoiceItem";
import { multipleResponseModule } from "./multiple_response/MultipleResponseItem";
import { multipleResponseGroupingModule } from "./multiple_response_grouping/MultipleResponseGroupingItem";
import { orderedResponseModule } from "./ordered_response/OrderedResponseItem";
import type { ItemRendererModule } from "./types";

/**
 * Renderers registered so far. Types missing here are shown as "coming soon" by the gallery
 * rather than crashing. Add one line per item type as its renderer lands.
 */
export const RENDERERS: { [T in ItemType]?: ItemRendererModule<T> } = {
  multiple_choice: multipleChoiceModule,
  multiple_response: multipleResponseModule,
  matrix_multiple_choice: matrixMultipleChoiceModule,
  matrix_multiple_response: matrixMultipleResponseModule,
  dropdown_cloze: dropdownClozeModule,
  dropdown_rationale: dropdownRationaleModule,
  dropdown_table: dropdownTableModule,
  multiple_response_grouping: multipleResponseGroupingModule,
  highlight_text: highlightTextModule,
  highlight_table: highlightTableModule,
  dragdrop_cloze: dragdropClozeModule,
  dragdrop_rationale: dragdropRationaleModule,
  ordered_response: orderedResponseModule,
};

export function hasRenderer(type: ItemType): boolean {
  return RENDERERS[type] !== undefined;
}
