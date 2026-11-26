/**
 * The review schedule (#626, ADR 0019): when a question a student missed comes back, and when it
 * stops coming back. Pure: no React, no Next, no Supabase, and no clock of its own. Every time is
 * handed in, as epoch milliseconds, so the same inputs always give the same answer.
 *
 * It is handed answers that are already scored, and only answers whose key the student has been
 * shown: the caller decides that, as it decides which marks reach `buildStepStandings`.
 *
 *   - A question answered below full marks enters review, due `DAY_MS` after that answer.
 *   - Answered in review once due, full marks moves it to the next gap (1, 3, 7, then 14 days,
 *     counted from that answer); full marks at the 14 day gap retires it as learned. Anything less
 *     sends it back to the 1 day gap.
 *   - Missed anywhere else (an assignment, a live session, practice), a waiting or a retired
 *     question goes back to the 1 day gap. Full marks anywhere else changes nothing: only a review
 *     moves a question forward.
 *   - A review answer given before the question is due, or on a question that is not waiting,
 *     counts as an answer anywhere else.
 *   - A mark worth nothing (`maxPoints` 0), or one no scorer could give, changes nothing.
 *
 * A sitting takes the questions that are due, the earliest due first, a tie going to the lower
 * question id, at most `REVIEW_SITTING_LIMIT` of them.
 *
 * Review answers never count toward a grade or toward "Your clinical judgment steps"; that is the
 * caller's rule, for the reason missed practice runs are left out of them
 * (20261023020000_practice_missed.sql): every one comes after the key was shown.
 */
import { isFullMarks } from "@/lib/assignments/resultsSummary";

export { isFullMarks };

/** Owner decision (#626, 1): the fixed gaps, in days, in the order a question moves through them. */
export const REVIEW_GAPS_DAYS = [1, 3, 7, 14] as const;
export type ReviewGap = (typeof REVIEW_GAPS_DAYS)[number];

/** A day is exactly 24 hours from the moment of the answer: there is no time zone to go by. */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** Owner decision (#626, 3): at most this many questions in one sitting. */
export const REVIEW_SITTING_LIMIT = 10;

/**
 * Where a question stands for one student. A question never in review has no state (`null`).
 * Each shape is one stored row with nothing derived stored twice (#627).
 */
export type ReviewState =
  | {
      kind: "waiting";
      /** The gap it is waiting out. */
      gapDays: ReviewGap;
      /** Epoch ms from which it is due: the answer that set this gap, plus the gap. */
      dueAt: number;
    }
  | {
      kind: "retired";
      /** Epoch ms of the full-marks answer at the 14 day gap. */
      retiredAt: number;
    };

/** One scored answer, given after the student was shown the question's key. */
export interface ReviewAnswer {
  /** In a review sitting, or anywhere else (an assignment, a live session, practice). */
  where: "review" | "elsewhere";
  mark: { points: number; maxPoints: number };
  /** Epoch ms of the answer. */
  answeredAt: number;
}

/** A question in a student's review list. Callers may carry fields of their own alongside. */
export interface ReviewEntry {
  questionId: string;
  state: ReviewState;
}

/** A score the engine could have given, as `stepStandings` draws it; above the maximum is allowed. */
const isRealMark = ({ points, maxPoints }: ReviewAnswer["mark"]): boolean =>
  Number.isFinite(points) && Number.isFinite(maxPoints) && points >= 0 && maxPoints > 0;

const waitingFrom = (gapDays: ReviewGap, answeredAt: number): ReviewState => ({
  kind: "waiting",
  gapDays,
  dueAt: answeredAt + gapDays * DAY_MS,
});

/** Whether a question is due at `now` (epoch ms): waiting, and its due time has come. */
export function isDue(state: ReviewState, now: number): boolean {
  return state.kind === "waiting" && state.dueAt <= now;
}

/**
 * The state after one answer. `current` is the stored state, `null` for a question never in
 * review; the result is `null` only when it was `null` and stays out.
 */
export function nextReviewState(
  current: ReviewState | null,
  answer: ReviewAnswer,
): ReviewState | null {
  const { answeredAt, mark } = answer;
  if (!Number.isFinite(answeredAt)) {
    throw new RangeError(`answeredAt must be a finite epoch time, got ${answeredAt}`);
  }
  if (!isRealMark(mark)) return current;

  if (!isFullMarks(mark)) return waitingFrom(1, answeredAt);

  const counts = answer.where === "review" && current !== null && isDue(current, answeredAt);
  if (!counts || current.kind !== "waiting") return current;

  const next = REVIEW_GAPS_DAYS[REVIEW_GAPS_DAYS.indexOf(current.gapDays) + 1];
  return next === undefined
    ? { kind: "retired", retiredAt: answeredAt }
    : waitingFrom(next, answeredAt);
}

/** Earliest due first; a tie by question id, compared by code unit so no locale can reorder it. */
function byDue<T extends ReviewEntry>(a: [T, number], b: [T, number]): number {
  if (a[1] !== b[1]) return a[1] - b[1];
  const [idA, idB] = [a[0].questionId, b[0].questionId];
  if (idA === idB) return 0;
  return idA < idB ? -1 : 1;
}

/**
 * What a sitting at `now` (epoch ms) takes: the due questions, earliest due first, at most `limit`
 * (a fraction rounds down, below one takes none). A fresh array; the list handed in is untouched.
 */
export function dueForReview<T extends ReviewEntry>(
  entries: readonly T[],
  now: number,
  limit: number = REVIEW_SITTING_LIMIT,
): T[] {
  const take = Math.max(0, Math.floor(limit));
  return entries
    .flatMap((entry): [T, number][] =>
      entry.state.kind === "waiting" && isDue(entry.state, now) ? [[entry, entry.state.dueAt]] : [],
    )
    .sort(byDue)
    .slice(0, take)
    .map(([entry]) => entry);
}
