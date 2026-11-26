/**
 * The student's review list on the server (#627; the rules are ADR 0019's, in
 * `src/lib/ngn/reviewSchedule.ts`).
 *
 *   - **Filling it from assignments** happens when the student home loads (`fillReviewList`), with
 *     no scheduled job: one bounded database call that adds the questions missed in released
 *     assignments not on the list yet. It never breaks the home: a failure is logged, without the
 *     student's id, and the home carries on; the next load tries again, and adds each question
 *     once however often it runs.
 *   - **Filling it from practice** needs nothing here: the database applies each recorded answer
 *     to the list in the statement that records it, and `POST /api/practice/answer` then reveals
 *     that question's key, and only after a recorded answer.
 *   - **A sitting** takes the due questions as `dueForReview` picks them (the earliest due first,
 *     ten at most), from the workspace of the earliest, since a run belongs to one workspace. The
 *     database checks the list again before it starts the run. No screen calls this yet (#628).
 */
import { dueForReview, REVIEW_SITTING_LIMIT } from "@/lib/ngn/reviewSchedule";
import type { RateLimitStore } from "@/lib/rateLimit/store";
import type { DueReviewItem, ReviewStart } from "@/lib/supabase/review";
import { PRACTICE_START_LIMIT, takePracticeLimit } from "./limits";

export interface ReviewListStore {
  /** How many questions were added, or null when the call failed. */
  fill(student: string): Promise<number | null>;
  /** The student's served questions due now, or null when the read failed. */
  due(student: string): Promise<DueReviewItem[] | null>;
  start(student: string, itemIds: readonly string[]): Promise<ReviewStart>;
}

/** Fills the list from released assignments. Resolves whatever happens; never throws. */
export async function fillReviewList(
  store: Pick<ReviewListStore, "fill">,
  student: string,
): Promise<void> {
  try {
    if ((await store.fill(student)) === null) {
      console.error("[review] filling the list from assignments failed");
    }
  } catch (error) {
    console.error("[review] filling the list from assignments failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

/** The questions a sitting at `now` (epoch ms) takes, all of the earliest one's workspace. */
export function pickReviewSitting(items: readonly DueReviewItem[], now: number): string[] {
  const first = dueForReview(items, now, 1)[0];
  if (first === undefined) return [];
  const sameWorkspace = items.filter((item) => item.workspaceId === first.workspaceId);
  return dueForReview(sameWorkspace, now, REVIEW_SITTING_LIMIT).map((item) => item.questionId);
}

export type StartReviewOutcome =
  { kind: "started"; runId: string } | { kind: "rate_limited" | "empty" | "failed" };

/**
 * Starts a review sitting of the student's due questions. Counted against `practice_start`, and
 * like a missed run it fails closed when the limiter is down: each start writes a whole run.
 */
export async function startReviewSitting(
  store: ReviewListStore,
  limiter: RateLimitStore,
  student: string,
  now: number,
): Promise<StartReviewOutcome> {
  if (
    !(await takePracticeLimit(limiter, "practice_start", student, PRACTICE_START_LIMIT, "refuse"))
  ) {
    return { kind: "rate_limited" };
  }
  const due = await store.due(student);
  if (due === null) return { kind: "failed" };
  const picked = pickReviewSitting(due, now);
  if (picked.length === 0) return { kind: "empty" };
  const start = await store.start(student, picked);
  if (start.ok) return { kind: "started", runId: start.runId };
  // The list was read a moment ago; a refusal of it means it changed under us, a failure to retry.
  return { kind: start.reason === "empty" ? "empty" : "failed" };
}
