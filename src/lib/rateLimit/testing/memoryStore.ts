import type { RateLimit, RateLimitBucket, RateLimitStore } from "../store";

/**
 * An in-memory `RateLimitStore` for tests only. App code never imports this: production counts in
 * Postgres (`../postgresStore.ts`), where the count holds across server instances.
 *
 * It mirrors `private.hit_rate_limit`: a fixed window per bucket and key that starts at the first
 * hit, and calls over the limit counted but capped one past it.
 */
export interface MemoryRateLimitStore extends RateLimitStore {
  /** Every later hit rejects with `error` until this is called again with null. */
  failWith(error: Error | null): void;
  /** Every hit asked for, in order. */
  hits(): readonly { bucket: RateLimitBucket; key: string }[];
}

interface CountedWindow {
  expiresAt: number;
  calls: number;
}

export function createMemoryRateLimitStore(
  options: { now?: () => number } = {},
): MemoryRateLimitStore {
  const now = options.now ?? Date.now;
  const windows = new Map<string, CountedWindow>();
  const asked: { bucket: RateLimitBucket; key: string }[] = [];
  let failure: Error | null = null;

  function count(id: string, limit: Readonly<RateLimit>, at: number): number {
    const current = windows.get(id);
    const next =
      !current || current.expiresAt <= at
        ? { expiresAt: at + limit.windowMs, calls: 1 }
        : { ...current, calls: Math.min(current.calls + 1, limit.attempts + 1) };
    windows.set(id, next);
    return next.calls;
  }

  return {
    async hit(bucket, key, limit) {
      asked.push({ bucket, key });
      if (failure) throw failure;
      return count(`${bucket}\n${key}`, limit, now()) <= limit.attempts;
    },
    failWith(error) {
      failure = error;
    },
    hits: () => [...asked],
  };
}
