import type { ItemType } from "@/lib/ngn/schemas";
import { matrixMultipleChoiceModule } from "./matrix_multiple_choice/MatrixMultipleChoiceItem";
import { matrixMultipleResponseModule } from "./matrix_multiple_response/MatrixMultipleResponseItem";
import { multipleChoiceModule } from "./multiple_choice/MultipleChoiceItem";
import { multipleResponseModule } from "./multiple_response/MultipleResponseItem";
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
};

export function hasRenderer(type: ItemType): boolean {
  return RENDERERS[type] !== undefined;
}
