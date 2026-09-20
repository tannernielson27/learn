import type { ScoreResult } from "@/lib/ngn/types";
import type { RowScore } from "./matrix/Matrix";
import type { PlayerMode } from "./types";

/**
 * Looks a row's points up in a checked answer (#56).
 *
 * Renderers used to re-run the +/- model against the answer key to fill this in, which put the
 * scoring engine in the student bundle and made the mark a second, divergent implementation of the
 * rule. The subtotals now travel with the score, so a row is marked with exactly the points the
 * scorer awarded it — including a floored row, whose deltas do not add up to its points.
 *
 * Returns undefined, and so no marks at all, until there is a score to show.
 */
export function rowScorer(
  mode: PlayerMode,
  score: ScoreResult | undefined,
): ((rowId: string) => RowScore | undefined) | undefined {
  if (mode !== "feedback" || !score?.groups?.length) return undefined;
  const byRow = new Map(score.groups.map((g) => [g.groupId, g]));
  return (rowId) => {
    const group = byRow.get(rowId);
    return group ? { points: group.points, maxPoints: group.maxPoints } : undefined;
  };
}
