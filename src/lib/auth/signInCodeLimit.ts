import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";
import {
  clientIp,
  normalizeSignInAddress,
  SIGN_IN_RATE_LIMITED,
  SIGN_IN_UNAVAILABLE,
  type RequestHeaders,
  type SignInRateLimitResult,
} from "./signInRateLimit";

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

export interface SignInCodeLimiter {
  /** Counts one code try against the caller, the pair, then the address; says whether to verify. */
  take(ip: string | null, email: string): Promise<SignInRateLimitResult>;
  /** Refusals by the per-address ceiling in this instance: a campaign, for the operator's log. */
  ceilingRefusals(): number;
}

const SPENT: SignInRateLimitResult = { ok: false, error: SIGN_IN_CODE_TRIES_SPENT };

/**
 * The code-try counters, on the shared store (#234). Fail closed like sign-in: a store that
 * cannot answer usually means Supabase Auth, on the same database, could not either.
 */
export function createSignInCodeLimiter(
  store: RateLimitStore,
  limits: typeof SIGN_IN_CODE_LIMITS = SIGN_IN_CODE_LIMITS,
): SignInCodeLimiter {
  let ceilingRefusals = 0;
  return {
    async take(ip, email) {
      const address = normalizeSignInAddress(email);
      try {
        // Narrowest first, so a caller over its own budget spends nothing shared.
        if (ip !== null) {
          if (!(await store.hit("sign_in_code", ip, limits.perCaller))) {
            return { ok: false, error: SIGN_IN_RATE_LIMITED };
          }
          if (!(await store.hit("sign_in_code_pair", `${ip}|${address}`, limits.perPair))) {
            return SPENT;
          }
        }
        if (!(await store.hit("sign_in_code_address", address, limits.perAddress))) {
          ceilingRefusals += 1;
          // A total, never the address: who is being targeted must not leak.
          console.warn("[sign-in] an address reached the code-try ceiling", { ceilingRefusals });
          return SPENT;
        }
        return { ok: true };
      } catch (error) {
        console.error("[sign-in] the shared rate limiter could not answer a code try", {
          error: error instanceof Error ? error.name : "unknown",
        });
        return { ok: false, error: SIGN_IN_UNAVAILABLE };
      }
    },
    ceilingRefusals: () => ceilingRefusals,
  };
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
