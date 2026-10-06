import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";
import { clientIp, type RequestHeaders, type SignInRateLimitResult } from "./signInRateLimit";
import { createTryLimiter, type TryLimiter } from "./tryLimit";

const FIVE_MINUTES = 5 * 60_000;

/**
 * How many one-time codes may be tried (#306), in three tiers, the same shape as the link limits
 * (#139, `SIGN_IN_ADDRESS_LIMITS`):
 *
 * - **perPair**, one caller at one address: three tries per five minutes. Nobody typing their own
 *   code needs more, and it is what one guesser gets.
 * - **perAddress**, every caller at one address: fifteen per five minutes. The ceiling on guessing
 *   from many networks at once: 180 an hour, about one chance in 5,500 of hitting a live six-digit
 *   code before it expires. It is also what a campaign would have to spend to lock the owner out,
 *   which takes many networks rather than one, and even then the emailed link still works.
 * - **perCaller**, one caller across addresses: thirty per five minutes, as for asking for links
 *   (#134), so one network cannot sweep a class list.
 *
 * Every tier counts whether or not the address has an account, so a refusal says only that someone
 * has been trying, never that the address is one LeaRN knows.
 */
export const SIGN_IN_CODE_LIMITS = {
  perCaller: { attempts: 30, windowMs: FIVE_MINUTES },
  perPair: { attempts: 3, windowMs: FIVE_MINUTES },
  perAddress: { attempts: 15, windowMs: FIVE_MINUTES },
} as const satisfies Record<string, RateLimit>;

export const SIGN_IN_CODE_TRIES_SPENT =
  "Too many tries for this code. Wait a few minutes, or open the link in the email instead.";

export type SignInCodeLimiter = TryLimiter;

/** The code-try counters, on the shared store (#234). See `createTryLimiter`. */
export function createSignInCodeLimiter(
  store: RateLimitStore,
  limits: typeof SIGN_IN_CODE_LIMITS = SIGN_IN_CODE_LIMITS,
): SignInCodeLimiter {
  return createTryLimiter(store, {
    buckets: {
      caller: "sign_in_code",
      pair: "sign_in_code_pair",
      address: "sign_in_code_address",
    },
    limits,
    spent: SIGN_IN_CODE_TRIES_SPENT,
    what: "code",
  });
}

let sharedLimiter: SignInCodeLimiter | undefined;

/** Counts one code try from this request, on the Postgres store. */
export function takeSignInCode(
  requestHeaders: RequestHeaders,
  email: string,
  limiter: SignInCodeLimiter = (sharedLimiter ??= createSignInCodeLimiter(sharedRateLimitStore())),
): Promise<SignInRateLimitResult> {
  return limiter.take(clientIp(requestHeaders), email);
}
