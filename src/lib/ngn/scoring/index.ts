import type { AnyResponse, CaseStudy, Item, ItemOf, ItemType, ResponseOf } from "../schemas";
import { ScoringError, type ScoreResult } from "../types";
import { SCORERS } from "./items";

export * from "./models";

/**
 * Score a response against an item. Throws `ScoringError` when the response type does not
 * match the item type. Pure: never mutates its inputs.
 */
export function scoreItem(item: Item, response: AnyResponse): ScoreResult {
  if (item.type !== response.type) {
    throw new ScoringError(
      "type_mismatch",
      `response type "${response.type}" does not match item type "${item.type}"`,
    );
  }
  return scoreTyped(item.type, item, response);
}

function scoreTyped<T extends ItemType>(type: T, item: Item, response: AnyResponse): ScoreResult {
  const scorer = SCORERS[type];
  return scorer(item as ItemOf<T>, response as ResponseOf<T>);
}

/** An empty response of the right shape for an item, used to compute max points and to seed players. */
export function emptyResponse(item: Item): AnyResponse {
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

/** Maximum points an item can award, derived from the scoring rules rather than trusted from metadata. */
export function maxPoints(item: Item): number {
  return scoreItem(item, emptyResponse(item)).maxPoints;
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

/** What a whole case study can award, derived from the scoring rules rather than its metadata. */
export function caseStudyMaxPoints(caseStudy: CaseStudy): number {
  return caseStudy.items.reduce((sum, item) => sum + maxPoints(item), 0);
}
