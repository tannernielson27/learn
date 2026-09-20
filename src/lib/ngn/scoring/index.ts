import { emptyResponse } from "../results";
import type { AnyResponse, CaseStudy, Item, ItemOf, ItemType, ResponseOf } from "../schemas";
import { ScoringError, type ScoreResult } from "../types";
import { SCORERS } from "./items";

export * from "./models";
// Kept exported here, where it has always been imported from, though it scores nothing.
export { emptyResponse } from "../results";

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

/** Maximum points an item can award, derived from the scoring rules rather than trusted from metadata. */
export function maxPoints(item: Item): number {
  return scoreItem(item, emptyResponse(item)).maxPoints;
}

/** What a whole case study can award, derived from the scoring rules rather than its metadata. */
export function caseStudyMaxPoints(caseStudy: CaseStudy): number {
  return caseStudy.items.reduce((sum, item) => sum + maxPoints(item), 0);
}
