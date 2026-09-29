import type { ScoreResult } from "@/lib/ngn/types";

export type VerdictKind = "full" | "partial" | "none";

export interface Verdict {
  kind: VerdictKind;
  /** The one-line answer to "did I get it?", read before the number. */
  headline: string;
  /** The points in words, e.g. "3 of 4 points". */
  detail: string;
}

/**
 * Deliberately not the element words. An option is "Correct", "Incorrect" or "Missed"; the item as
 * a whole is "All correct", "Partially correct" or "Not correct", so a screen reader never hears
 * the same word for one option and for the whole answer.
 */
const HEADLINES: Record<VerdictKind, string> = {
  full: "All correct",
  partial: "Partially correct",
  none: "Not correct",
};

/**
 * What a checked answer amounts to, read off the score the server sent: nothing is recomputed from
 * the marks, which can disagree with the points (a rationale dyad with one blank right shows that
 * blank correct and scores nothing). An item worth nothing is never "All correct".
 */
export function scoreVerdict(score: ScoreResult): Verdict {
  const kind: VerdictKind =
    score.maxPoints > 0 && score.points >= score.maxPoints
      ? "full"
      : score.points > 0
        ? "partial"
        : "none";
  const unit = score.maxPoints === 1 ? "point" : "points";
  return {
    kind,
    headline: HEADLINES[kind],
    detail: `${score.points} of ${score.maxPoints} ${unit}`,
  };
}
