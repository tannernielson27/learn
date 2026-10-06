import type { RateLimit, RateLimitBucket, RateLimitStore } from "@/lib/rateLimit/store";
import {
  normalizeSignInAddress,
  SIGN_IN_RATE_LIMITED,
  SIGN_IN_UNAVAILABLE,
  type SignInRateLimitResult,
} from "./signInRateLimit";

/** The three tiers a guessable secret is counted in: see `SIGN_IN_CODE_LIMITS` for the reasoning. */
export interface TryLimits {
  /** One caller across every address. */
  perCaller: RateLimit;
  /** One caller at one address. */
  perPair: RateLimit;
  /** Every caller at one address. */
  perAddress: RateLimit;
}

export interface TryLimiterConfig {
  buckets: { caller: RateLimitBucket; pair: RateLimitBucket; address: RateLimitBucket };
  limits: TryLimits;
  /** What the person reads once the pair or the address has no tries left. */
  spent: string;
  /** Names the secret in the operator's log: "code", "password". */
  what: string;
}

export interface TryLimiter {
  /** Counts one try against the caller, the pair, then the address; says whether to go on. */
  take(ip: string | null, email: string): Promise<SignInRateLimitResult>;
  /** Refusals by the per-address ceiling in this instance: a campaign, for the operator's log. */
  ceilingRefusals(): number;
}

/**
 * Counts tries at a secret someone could guess (an emailed code, a password), on the shared store
 * (#234). Fails closed like sign-in: a store that cannot answer usually means Supabase Auth, on
 * the same database, could not either.
 *
 * Every tier counts whether or not the address has an account, so a refusal says only that someone
 * has been trying, never that the address is one LeaRN knows.
 */
export function createTryLimiter(store: RateLimitStore, config: TryLimiterConfig): TryLimiter {
  const { buckets, limits, what } = config;
  const spent: SignInRateLimitResult = { ok: false, error: config.spent };
  let ceilingRefusals = 0;
  return {
    async take(ip, email) {
      const address = normalizeSignInAddress(email);
      try {
        // Narrowest first, so a caller over its own budget spends nothing shared.
        if (ip !== null) {
          if (!(await store.hit(buckets.caller, ip, limits.perCaller))) {
            return { ok: false, error: SIGN_IN_RATE_LIMITED };
          }
          if (!(await store.hit(buckets.pair, `${ip}|${address}`, limits.perPair))) {
            return spent;
          }
        }
        if (!(await store.hit(buckets.address, address, limits.perAddress))) {
          ceilingRefusals += 1;
          // A total, never the address: who is being targeted must not leak.
          console.warn(`[sign-in] an address reached the ${what}-try ceiling`, { ceilingRefusals });
          return spent;
        }
        return { ok: true };
      } catch (error) {
        console.error(`[sign-in] the shared rate limiter could not answer a ${what} try`, {
          error: error instanceof Error ? error.name : "unknown",
        });
        return { ok: false, error: SIGN_IN_UNAVAILABLE };
      }
    },
    ceilingRefusals: () => ceilingRefusals,
  };
}
