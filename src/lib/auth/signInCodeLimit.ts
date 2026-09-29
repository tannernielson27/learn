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
 * How many one-time codes may be tried (#306). A code is six digits and lives an hour, so the
 * per-address limit is the one that matters: five tries per five minutes is sixty an hour, about
 * one chance in seventeen thousand of guessing a live code before it expires. Nobody typing their
 * own code needs more than a couple. The per-caller limit stops one network sweeping many
 * addresses, at the same thirty per five minutes as asking for links (#134).
 *
 * The address limit counts whether or not the address has an account, so being refused says only
 * that someone has been trying this address, never that it is one LeaRN knows.
 */
export const SIGN_IN_CODE_LIMITS = {
  perCaller: { attempts: 30, windowMs: FIVE_MINUTES },
  perAddress: { attempts: 5, windowMs: FIVE_MINUTES },
} as const satisfies Record<string, RateLimit>;

export const SIGN_IN_CODE_TRIES_SPENT =
  "Too many tries for this code. Wait a few minutes, or open the link in the email instead.";

export interface SignInCodeLimiter {
  /** Counts one code try against the caller, then the address, and says whether to verify it. */
  take(ip: string | null, email: string): Promise<SignInRateLimitResult>;
}

/**
 * The code-try counters, on the shared store (#234). Fail closed like sign-in: a store that
 * cannot answer usually means Supabase Auth, on the same database, could not either.
 */
export function createSignInCodeLimiter(
  store: RateLimitStore,
  limits: typeof SIGN_IN_CODE_LIMITS = SIGN_IN_CODE_LIMITS,
): SignInCodeLimiter {
  return {
    async take(ip, email) {
      try {
        // The caller first, so a network over its budget does not also spend an address's tries.
        if (ip !== null && !(await store.hit("sign_in_code", ip, limits.perCaller))) {
          return { ok: false, error: SIGN_IN_RATE_LIMITED };
        }
        const address = normalizeSignInAddress(email);
        if (!(await store.hit("sign_in_code_address", address, limits.perAddress))) {
          return { ok: false, error: SIGN_IN_CODE_TRIES_SPENT };
        }
        return { ok: true };
      } catch (error) {
        console.error("[sign-in] the shared rate limiter could not answer a code try", {
          error: error instanceof Error ? error.name : "unknown",
        });
        return { ok: false, error: SIGN_IN_UNAVAILABLE };
      }
    },
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
