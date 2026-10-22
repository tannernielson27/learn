/**
 * An assignment's results as summary rows (`resultsSummary.ts`). Types only from the results
 * loader, which is server code: this module is safe in a student's bundle.
 */
import type { ResultEntry } from "./results";
import { rowOf, type ResultRow } from "./resultsSummary";

export function rowsFromResults(entries: readonly ResultEntry[]): ResultRow[] {
  return entries.map((entry, index) => {
    const { outcome } = entry;
    const mark =
      outcome.kind === "answered"
        ? { points: outcome.score.points, maxPoints: outcome.score.maxPoints }
        : outcome.kind === "unreadable"
          ? "unreadable"
          : "unanswered";
    return rowOf(entry.rowId, index + 1, entry.item, mark);
  });
}
