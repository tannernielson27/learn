import { describe, expect, it } from "vitest";
import { RateLimitUnavailableError } from "../store";
import { createMemoryRateLimitStore } from "./memoryStore";

const LIMIT = { attempts: 2, windowMs: 1_000 } as const;

/**
 * The fake every limiter test runs against. It must behave like private.hit_rate_limit, which
 * supabase/tests/database/shared_rate_limits.test.sql pins down on a real database.
 */
describe("createMemoryRateLimitStore", () => {
  it("allows exactly the limit in a window, then refuses", async () => {
    const store = createMemoryRateLimitStore();
    expect(await store.hit("sign_in_demo", "k", LIMIT)).toBe(true);
    expect(await store.hit("sign_in_demo", "k", LIMIT)).toBe(true);
    expect(await store.hit("sign_in_demo", "k", LIMIT)).toBe(false);
  });

  it("keeps buckets and keys apart", async () => {
    const store = createMemoryRateLimitStore();
    await store.hit("sign_in_demo", "k", LIMIT);
    await store.hit("sign_in_demo", "k", LIMIT);
    expect(await store.hit("sign_in_email", "k", LIMIT)).toBe(true);
    expect(await store.hit("sign_in_demo", "other", LIMIT)).toBe(true);
  });

  it("starts a window over once it has run out, and hammering does not push it out", async () => {
    let now = 0;
    const store = createMemoryRateLimitStore({ now: () => now });
    for (let call = 0; call < 50; call += 1) {
      now = call;
      await store.hit("sign_in_demo", "k", LIMIT);
    }
    now = LIMIT.windowMs - 1;
    expect(await store.hit("sign_in_demo", "k", LIMIT)).toBe(false);
    now = LIMIT.windowMs;
    expect(await store.hit("sign_in_demo", "k", LIMIT)).toBe(true);
  });

  it("can be made to fail, the way an unreachable database does", async () => {
    const store = createMemoryRateLimitStore();
    store.failWith(new RateLimitUnavailableError("test"));
    await expect(store.hit("sign_in_demo", "k", LIMIT)).rejects.toBeInstanceOf(
      RateLimitUnavailableError,
    );
    store.failWith(null);
    await expect(store.hit("sign_in_demo", "k", LIMIT)).resolves.toBe(true);
  });

  it("counts every hit it was asked for", async () => {
    const store = createMemoryRateLimitStore();
    await store.hit("sign_in_demo", "k", LIMIT);
    await store.hit("sign_in_email", "k", LIMIT);
    expect(store.hits()).toEqual([
      { bucket: "sign_in_demo", key: "k" },
      { bucket: "sign_in_email", key: "k" },
    ]);
  });
});
