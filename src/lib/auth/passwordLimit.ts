import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";
import { clientIp, type RequestHeaders, type SignInRateLimitResult } from "./signInRateLimit";
import { createTryLimiter, type TryLimiter } from "./tryLimit";

const FIVE_MINUTES = 5 * 60_000;

/**
 * How many passwords may be tried, in the three tiers the one-time code uses (`SIGN_IN_CODE_LIMITS`):
 *
 * - **perPair**, one caller at one address: five per five minutes. Enough for someone who has
 *   forgotten which of their passwords it was, and it is all one guesser gets.
 * - **perAddress**, every caller at one address: twenty per five minutes. The ceiling on guessing
 *   one account from many networks at once, and what a campaign must spend to shut the owner out
 *   of their password, which takes several networks. The emailed link still works even then.
 * - **perCaller**, one caller across addresses: 150 per five minutes, the invite total (#217),
 *   because a whole class signs in from one campus address in the first minutes of a session.
 *
 * Supabase Auth has no lockout of its own for a wrong password, so these are the only ones.
 */
export const SIGN_IN_PASSWORD_LIMITS = {
  perCaller: { attempts: 150, windowMs: FIVE_MINUTES },
  perPair: { attempts: 5, windowMs: FIVE_MINUTES },
  perAddress: { attempts: 20, windowMs: FIVE_MINUTES },
} as const satisfies Record<string, RateLimit>;

export const SIGN_IN_PASSWORD_TRIES_SPENT =
  "Too many tries with a password. Wait a few minutes, or get a sign-in link by email instead.";

/** The password-try counters, on the shared store (#234). See `createTryLimiter`. */
export function createSignInPasswordLimiter(
  store: RateLimitStore,
  limits: typeof SIGN_IN_PASSWORD_LIMITS = SIGN_IN_PASSWORD_LIMITS,
): TryLimiter {
  return createTryLimiter(store, {
    buckets: {
      caller: "sign_in_password",
      pair: "sign_in_password_pair",
      address: "sign_in_password_address",
    },
    limits,
    spent: SIGN_IN_PASSWORD_TRIES_SPENT,
    what: "password",
  });
}

let sharedLimiter: TryLimiter | undefined;

/** Counts one password try from this request, on the Postgres store. */
export function takeSignInPassword(
  requestHeaders: RequestHeaders,
  email: string,
  limiter: TryLimiter = (sharedLimiter ??= createSignInPasswordLimiter(sharedRateLimitStore())),
): Promise<SignInRateLimitResult> {
  return limiter.take(clientIp(requestHeaders), email);
}
