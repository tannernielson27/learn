import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";

/**
 * How many Checkout or Customer Portal sessions one teacher may ask Stripe for (#519): ten in
 * fifteen minutes. Starting a trial or opening Billing takes one press; a few more cover a
 * cancelled Checkout and a second try. Each press is a call to Stripe made with the deployment's
 * key, so this keeps one account from spending the key's own rate limit.
 */
export const BILLING_SESSION_LIMIT = {
  attempts: 10,
  windowMs: 15 * 60_000,
} as const satisfies RateLimit;

export type BillingAllowance = "ok" | "rate_limited" | "unavailable";

/**
 * Counts one session for `userId` (an account id, never an address). Never throws, and fails
 * closed: no answer means no session.
 */
export async function takeBillingSession(
  userId: string,
  store: RateLimitStore = sharedRateLimitStore(),
): Promise<BillingAllowance> {
  try {
    return (await store.hit("billing_session", userId, BILLING_SESSION_LIMIT))
      ? "ok"
      : "rate_limited";
  } catch (error) {
    console.error("[billing] the shared rate limiter could not answer, so nothing was opened", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return "unavailable";
  }
}
