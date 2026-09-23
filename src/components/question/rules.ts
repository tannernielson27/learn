import type { ItemType } from "@/lib/ngn/schemas";
import { explainRationale } from "./rationale";
import { allBlanksFilled } from "./sentence";
import type { ItemRendererModule } from "./types";

/** Everything the player needs from an item type besides the component that draws it. */
export type ItemRules<T extends ItemType> = Omit<ItemRendererModule<T>, "Renderer">;

/**
 * Per-type rules the player reads synchronously: whether Submit is enabled, and the extra sentence
 * under a score. They are kept out of the renderer files so that loading a renderer lazily (#54)
 * never delays Submit, and so this module carries no React and no dnd-kit.
 */
export const RULES: { [T in ItemType]: ItemRules<T> } = {
  multiple_choice: {
    isComplete: (_item, response) => response.optionId !== undefined,
  },
  multiple_response: {
    isComplete: (item, response) => {
      if (item.content.variant === "select_n") return response.optionIds.length === item.content.n;
      return response.optionIds.length > 0;
    },
  },
  multiple_response_grouping: {
    isComplete: (item, response) =>
      item.content.rows.every((row) =>
        response.rows.some((r) => r.rowId === row.id && r.optionIds.length > 0),
      ),
  },
  matrix_multiple_choice: {
    isComplete: (item, response) =>
      item.content.rows.every((row) => response.rows.some((r) => r.rowId === row.id)),
  },
  matrix_multiple_response: {
    isComplete: (item, response) =>
      item.content.rows.every((row) =>
        response.rows.some((r) => r.rowId === row.id && r.columnIds.length > 0),
      ),
  },
  dropdown_cloze: {
    isComplete: (item, response) => allBlanksFilled(item.content.tokens, response.blanks),
  },
  dropdown_rationale: {
    isComplete: (item, response) => allBlanksFilled(item.content.tokens, response.blanks),
    explainScore: (item, result) =>
      explainRationale(item.content.tokens, item.answerKey.anchorBlankId, result),
  },
  dropdown_table: {
    isComplete: (item, response) =>
      item.content.rows.every((row) => response.rows.some((r) => r.rowId === row.id)),
  },
  highlight_text: {
    isComplete: (_item, response) => response.spanIds.length > 0,
  },
  highlight_table: {
    isComplete: (_item, response) => response.spanIds.length > 0,
    explainScore: (item) =>
      item.content.scorePerRow
        ? "Each row is scored on its own, so an extra highlight in one row cannot cost points in another."
        : undefined,
  },
  dragdrop_cloze: {
    isComplete: (item, response) => allBlanksFilled(item.content.tokens, response.blanks),
  },
  dragdrop_rationale: {
    isComplete: (item, response) => allBlanksFilled(item.content.tokens, response.blanks),
    explainScore: (item, result) =>
      explainRationale(item.content.tokens, item.answerKey.anchorBlankId, result),
  },
  ordered_response: {
    isComplete: (item, response) => response.orderedIds.length === item.content.items.length,
    explainScore: (item) =>
      item.content.partial === "position"
        ? "Each step in its correct position earns a point."
        : "The whole order must be exact to earn the point.",
  },
  bowtie: {
    isComplete: (_item, response) =>
      response.actionIds.length === 2 &&
      response.conditionId !== undefined &&
      response.parameterIds.length === 2,
    explainScore: () =>
      "Each of the five slots earns a point; the order within a pair does not matter.",
  },
};
