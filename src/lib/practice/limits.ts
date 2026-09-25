/**
 * The per-student limits on practice (#241), counted in the shared limiter (#234) so they hold
 * across every server instance.
 *
 * **These fail open.** When the limiter cannot answer, the request goes ahead and a warning is
 * logged. Practice is never graded, so an unlimited burst costs some database writes and nothing a
 * teacher relies on; refusing every student's practice whenever the limiter is down would cost
 * them the feature. Sign-in and invites fail closed (see `signInRateLimit.ts`), because what they
 * protect is a mailbox and an account.
 *
 * The key is the student's own id, which the shared store hashes before it leaves the server.
 */
import type { RateLimit, RateLimitBucket, RateLimitStore } from "@/lib/rateLimit/store";

/** Thirty answers a minute: a student reading each item and its rationale is far below it. */
export const PRACTICE_ANSWER_LIMIT: Readonly<RateLimit> = { attempts: 30, windowMs: 60_000 };

/** Ten "Start over"s in five minutes. Each one is a new run row. */
export const PRACTICE_START_LIMIT: Readonly<RateLimit> = { attempts: 10, windowMs: 5 * 60_000 };

export type PracticeBucket = Extract<RateLimitBucket, "practice_answer" | "practice_start">;

/** Counts one hit for the student. True when within the limit, or when the limiter is down. */
export async function takePracticeLimit(
  store: RateLimitStore,
  bucket: PracticeBucket,
  studentId: string,
  limit: Readonly<RateLimit>,
): Promise<boolean> {
  try {
    return await store.hit(bucket, studentId, limit);
  } catch (error) {
    // Never the student id: the message says which limit, and why, and nothing about who.
    console.warn("[practice] the rate limiter could not answer; allowing the request", {
      bucket,
      reason: error instanceof Error ? error.name : "unknown",
    });
    return true;
  }
}
