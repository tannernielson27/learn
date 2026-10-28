import { clientIp, type RequestHeaders } from "@/lib/auth/signInRateLimit";
import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";

/**
 * How often one caller may post to a beta pass page: ten in fifteen minutes. A tester needs one
 * press. The token is 192 random bits, so this does not stand between a guesser and a pass; it
 * stands between a script and the database. It is checked before anything else, the link
 * included, so being refused says nothing about any link.
 *
 * `redeem_beta_pass` is the server's alone (service role), so every redemption passes through
 * this. The shared store is the one `/w/<token>` posts count in (`acceptLimit.ts`).
 */
export const BETA_PASS_REDEEM_LIMIT = {
  attempts: 10,
  windowMs: 15 * 60_000,
} as const satisfies RateLimit;

export type RedeemAttempt = { ok: true } | { ok: false; reason: "rate_limited" | "unavailable" };

/**
 * Counts one post from this request on the shared store and says whether to go on. The caller is
 * the address `clientIp` trusts, never a header of the caller's choosing. Off Vercel there is no
 * caller to key on, so nothing is counted, as for every other limiter here. Never throws, and
 * fails closed.
 */
export async function takeBetaPassAttempt(
  requestHeaders: RequestHeaders,
  store: RateLimitStore = sharedRateLimitStore(),
): Promise<RedeemAttempt> {
  const ip = clientIp(requestHeaders);
  if (ip === null) return { ok: true };
  try {
    if (await store.hit("beta_pass_redeem", ip, BETA_PASS_REDEEM_LIMIT)) return { ok: true };
    return { ok: false, reason: "rate_limited" };
  } catch (error) {
    console.error("[free-access] the shared rate limiter could not answer", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, reason: "unavailable" };
  }
}
