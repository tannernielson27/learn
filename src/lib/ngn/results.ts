/**
 * Working with responses and with scores that have already been awarded. Nothing here reads an
 * answer key or scores anything, so a player can open an item and a summary can add up a case
 * study without the engine reaching their bundle (#56, ADR 0003).
 */
import type { AnyResponse, Item } from "./schemas";
import type { ScoreResult } from "./types";

/**
 * An empty response of the right shape for an item, used to compute max points and to seed
 * players. Reads only the item's type, never its key, so a keyless item opens the same way.
 */
export function emptyResponse(item: Pick<Item, "type">): AnyResponse {
  switch (item.type) {
    case "multiple_choice":
      return { type: item.type };
    case "multiple_response":
      return { type: item.type, optionIds: [] };
    case "multiple_response_grouping":
    case "matrix_multiple_choice":
    case "matrix_multiple_response":
    case "dropdown_table":
      return { type: item.type, rows: [] } as AnyResponse;
    case "dropdown_cloze":
    case "dropdown_rationale":
    case "dragdrop_cloze":
    case "dragdrop_rationale":
      return { type: item.type, blanks: [] } as AnyResponse;
    case "highlight_text":
    case "highlight_table":
      return { type: item.type, spanIds: [] } as AnyResponse;
    case "ordered_response":
      return { type: item.type, orderedIds: [] };
    case "bowtie":
      return { type: item.type, actionIds: [], parameterIds: [] };
  }
}

/** The running total across a case study's steps. Empty until the first step is scored. */
export function totalScore(results: readonly ScoreResult[]): {
  points: number;
  maxPoints: number;
} {
  return results.reduce(
    (sum, result) => ({
      points: sum.points + result.points,
      maxPoints: sum.maxPoints + result.maxPoints,
    }),
    { points: 0, maxPoints: 0 },
  );
}
