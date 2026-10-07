import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";
import { clientIp, type RequestHeaders, type SignInRateLimitResult } from "./signInRateLimit";
import { createTryLimiter, type TryLimiter } from "./tryLimit";

const FIVE_MINUTES = 5 * 60_000;

/**
 * How many sign-ups may be tried through the site's form (#359, ADR 0009), in the three tiers the
 * password and the one-time code use (`createTryLimiter`):
 *
 * - **perCaller**, one caller across every address: 60 per five minutes. A class told to "go and
 *   sign up" arrives from one campus address (the lesson of #217), so this must admit a room; 60
 *   is a full class once. It is also the most addresses one caller can ask "does this have an
 *   account?" about in a window, which the form answers since the 2026-10-06 owner decision.
 * - **perPair**, one caller at one address: 5. A person needs one, or a few after a mistyped
 *   password; nobody but that caller can spend it.
 * - **perAddress**, every caller at one address: 10. An address signs up once. This is what many
 *   networks together may spend on one address, and its refusals are logged without the address.
 *
 * None of these bounds mail on its own: 60 a window is far past Resend's 100 a day. The CAPTCHA
 * (`captcha.ts`) is what makes each try cost something; these keep a caller that solves it from
 * running unbounded. They count tries made through this site only, which is why Supabase's own
 * sign-up endpoint must be closed (`enable_signup = false`, `pnpm golive:check`).
 *
 * Off Vercel there is no caller to key on (`clientIp`), so only the per-address tier counts, as
 * for every other limiter here; local runs and e2e are not locked out by their own address.
 */
export const SIGN_UP_LIMITS = {
  perCaller: { attempts: 60, windowMs: FIVE_MINUTES },
  perPair: { attempts: 5, windowMs: FIVE_MINUTES },
  perAddress: { attempts: 10, windowMs: FIVE_MINUTES },
} as const satisfies Record<string, RateLimit>;

/** The caller has tried too many addresses. Says nothing about any of them. */
export const SIGN_UP_RATE_LIMITED =
  "Too many sign-ups from this network. Wait a few minutes, then try again.";

/** This address has been tried too often, by this caller or by everyone together. */
export const SIGN_UP_TRIES_SPENT =
  "Too many tries to sign up with this address. Wait a few minutes, then try again.";

/** The shared store could not answer: refused rather than let through uncounted. */
export const SIGN_UP_UNAVAILABLE = "Signing up is not working just now. Try again in a moment.";

/** The sign-up counters, on the shared store (#234). See `createTryLimiter`. */
export function createSignUpLimiter(
  store: RateLimitStore,
  limits: typeof SIGN_UP_LIMITS = SIGN_UP_LIMITS,
): TryLimiter {
  return createTryLimiter(store, {
    buckets: { caller: "sign_up", pair: "sign_up_pair", address: "sign_up_address" },
    limits,
    spent: SIGN_UP_TRIES_SPENT,
    what: "sign-up",
    scope: "sign-up",
    rateLimited: SIGN_UP_RATE_LIMITED,
    unavailable: SIGN_UP_UNAVAILABLE,
  });
}

let sharedLimiter: TryLimiter | undefined;

/**
 * Counts one sign-up try from this request, on the Postgres store, and says whether to go on:
 *
 *   const allowed = await takeSignUpAttempt(await headers(), email);
 *   if (!allowed.ok) return { status: "error", error: allowed.error };
 *
 * Call it once the form has parsed and before `verifyCaptcha`, so a refused caller costs no call
 * to Cloudflare and a failed CAPTCHA still counts. It never throws, and it fails closed: when the
 * store cannot answer, the result is `{ ok: false, error: SIGN_UP_UNAVAILABLE }`.
 */
export function takeSignUpAttempt(
  requestHeaders: RequestHeaders,
  email: string,
  limiter: TryLimiter = (sharedLimiter ??= createSignUpLimiter(sharedRateLimitStore())),
): Promise<SignInRateLimitResult> {
  return limiter.take(clientIp(requestHeaders), email);
}
