import { SCORING_MODEL_LABELS } from "@/lib/ngn/labels";
import type { ScoringModel } from "@/lib/ngn/types";

export interface ScoringSummary {
  /** "Worth 3 points. +/- scoring." or the not-ready message. */
  headline: string;
  /** The rule in one sentence, word for word as the student's score panel explains it. */
  rule?: string;
}

// Neutral on purpose: an item can be invalid with every answer already marked (an empty stem, a
// blank option), so the prompt must not tell the author to mark answers.
export const SCORING_NOT_READY = "Finish the item to see its score.";

const points = (count: number) => `${count} ${count === 1 ? "point" : "points"}`;

/**
 * What the editor says about scoring while an item is written. Only a valid item has a trustworthy
 * maximum, so an invalid one gets a prompt instead of a number that may change.
 */
export function scoringSummary(
  scoring: { model: ScoringModel; maxPoints: number } | undefined,
  valid: boolean,
): ScoringSummary {
  if (!valid || !scoring) return { headline: SCORING_NOT_READY };
  const label = SCORING_MODEL_LABELS[scoring.model];
  return {
    // Two sentences, so every model name reads naturally ("Rationale scoring", "+/- scoring").
    headline: `Worth ${points(scoring.maxPoints)}. ${label.name}.`,
    rule: label.explanation,
  };
}
