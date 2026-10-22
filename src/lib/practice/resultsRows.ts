/**
 * A practice run as summary rows (`@/lib/assignments/resultsSummary`), from the marks the server
 * sent back with each answer. No scoring here: safe in a student's bundle.
 */
import { rowOf, type ResultRow } from "@/lib/assignments/resultsSummary";
import { itemsOf, type PracticeAnswered, type PracticeEntry } from "./entries";

export function rowsFromPractice(
  entries: readonly PracticeEntry[],
  done: Readonly<Record<string, PracticeAnswered>>,
): ResultRow[] {
  return entries.flatMap(itemsOf).map((entry, index) => {
    const answered = done[entry.itemId];
    const mark =
      answered === undefined
        ? "unanswered"
        : answered.kind === "scored"
          ? { points: answered.reveal.score.points, maxPoints: answered.reveal.score.maxPoints }
          : "unreadable";
    return rowOf(entry.itemId, index + 1, entry.item, mark);
  });
}
