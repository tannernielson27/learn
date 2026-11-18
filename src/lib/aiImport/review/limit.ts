import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";

/**
 * How many review changes one teacher may make (#593): a drop, a restore, a bulk drop, a split or
 * a save. Each one ends with a pass over the batch by the service client (up to 150 entries
 * read, and a write for each whose duplicate flag changed), so a scripted loop would be cheap to
 * send and heavy to serve. 120 a minute is two a second, well past what a person reviewing a
 * document does; it bounds the pace, nothing else.
 */
export const AI_IMPORT_REVIEW_LIMIT: RateLimit = { attempts: 120, windowMs: 60 * 1000 };

export type ReviewAllowance = "ok" | "review_limited" | "unavailable";

/**
 * Counts one review change for `userId` (an account id; the store keeps only a keyed digest).
 * Never throws, and fails closed: no answer means no change.
 */
export async function takeReviewAction(
  userId: string,
  store: RateLimitStore = sharedRateLimitStore(),
): Promise<ReviewAllowance> {
  try {
    return (await store.hit("ai_import_review", userId, AI_IMPORT_REVIEW_LIMIT))
      ? "ok"
      : "review_limited";
  } catch (error) {
    console.error("[ai-import] the shared rate limiter could not answer, so nothing was changed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return "unavailable";
  }
}

export interface ReviewLimitDeps {
  /**
   * Counts the change before anything is read. Every Server Function hands in
   * `takeReviewAction`; a unit test that is not about the limit leaves it out.
   */
  allow?: (userId: string) => Promise<ReviewAllowance>;
}

/** Whether this teacher may make one more review change now. */
export const reviewAllowance = (deps: ReviewLimitDeps, userId: string): Promise<ReviewAllowance> =>
  deps.allow ? deps.allow(userId) : Promise.resolve("ok");
