/**
 * The shared rate limiter's interface (#234).
 *
 * Every limit whose caller has not signed in — sign-in, class invites, the reminder cron — counts
 * through a `RateLimitStore`. In production that is `private.hit_rate_limit` in Postgres
 * (`postgresStore.ts`), so the count holds across every Vercel instance. Tests use the in-memory
 * fake in `testing/memoryStore.ts`, which behaves the same way and is never imported by app code.
 *
 * A store answers one question: count one hit on this key, and was it within the limit? When it
 * cannot answer it rejects with `RateLimitUnavailableError`, and each caller decides what that
 * means for its own path (sign-in and invites refuse; see their modules).
 */

export interface RateLimit {
  attempts: number;
  windowMs: number;
}

/**
 * Every bucket the app counts in. A bucket names one limit; its keys are the callers, addresses or
 * classes that limit counts. The database refuses any bucket outside `^[a-z][a-z0-9_]{0,47}$`.
 */
export const RATE_LIMIT_BUCKETS = [
  "sign_in_email",
  "sign_in_demo",
  "sign_in_invite_class",
  "sign_in_invite_total",
  "sign_in_address_pair",
  "sign_in_address",
  "cron_denied",
  "cron_runs",
] as const;

export type RateLimitBucket = (typeof RATE_LIMIT_BUCKETS)[number];

export interface RateLimitStore {
  /**
   * Counts one hit on `key` in `bucket` and resolves true while the window has room. Calls over
   * the limit are counted but capped, so hammering neither shortens nor lengthens the wait.
   * Rejects with `RateLimitUnavailableError` when the answer cannot be had.
   */
  hit(bucket: RateLimitBucket, key: string, limit: Readonly<RateLimit>): Promise<boolean>;
}

/** The store could not answer. The message names a code at most, never a key. */
export class RateLimitUnavailableError extends Error {
  constructor(reason: string) {
    super(`the shared rate limiter could not answer (${reason})`);
    this.name = "RateLimitUnavailableError";
  }
}
