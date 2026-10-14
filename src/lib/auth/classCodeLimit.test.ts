import { describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_BUCKETS, RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { CLASS_CODE_LIMIT, createClassCodeLimiter, takeClassCodeAttempt } from "./classCodeLimit";
import { createSignUpLimiter } from "./signUpLimit";

const ON_VERCEL = (ip: string) => new Headers({ "x-vercel-id": "iad1::abc", "x-real-ip": ip });

describe("createClassCodeLimiter", () => {
  it("counts in a five-minute window, with room for a whole class behind one address", () => {
    expect(CLASS_CODE_LIMIT.windowMs).toBe(5 * 60_000);
    // Sixty students and a retry each (the lesson of #217), and no more.
    expect(CLASS_CODE_LIMIT.attempts).toBe(120);
  });

  it("refuses one caller past its budget, and leaves other callers theirs", async () => {
    const limiter = createClassCodeLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < CLASS_CODE_LIMIT.attempts; i += 1) {
      expect(await limiter.take("203.0.113.7")).toBe("ok");
    }
    expect(await limiter.take("203.0.113.7")).toBe("rate_limited");
    expect(await limiter.take("198.51.100.9")).toBe("ok");
  });

  it("is one budget for the address however many accounts try from it", async () => {
    // The limiter is never told who is signed in: there is nothing for a new account to reset.
    const store = createMemoryRateLimitStore();
    const limiter = createClassCodeLimiter(store, { attempts: 2, windowMs: 60_000 });
    expect(await limiter.take("203.0.113.7")).toBe("ok");
    expect(await limiter.take("203.0.113.7")).toBe("ok");
    expect(await limiter.take("203.0.113.7")).toBe("rate_limited");
    expect(new Set(store.hits().map((hit) => hit.key))).toEqual(new Set(["203.0.113.7"]));
  });

  it("counts nothing when there is no caller to key on (off Vercel)", async () => {
    const store = createMemoryRateLimitStore();
    const limiter = createClassCodeLimiter(store, { attempts: 1, windowMs: 60_000 });
    expect(await limiter.take(null)).toBe("ok");
    expect(await limiter.take(null)).toBe("ok");
    expect(store.hits()).toEqual([]);
  });

  it("fails closed when the store cannot answer, and logs no address", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createMemoryRateLimitStore();
    store.failWith(new RateLimitUnavailableError("PGRST000"));
    const limiter = createClassCodeLimiter(store);
    expect(await limiter.take("203.0.113.7")).toBe("unavailable");
    expect(JSON.stringify(error.mock.calls)).toContain("[class-code]");
    expect(JSON.stringify(error.mock.calls)).not.toContain("203.0.113.7");
    error.mockRestore();
  });

  it("logs a refusal without the address", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limiter = createClassCodeLimiter(createMemoryRateLimitStore(), {
      attempts: 1,
      windowMs: 60_000,
    });
    await limiter.take("203.0.113.7");
    expect(await limiter.take("203.0.113.7")).toBe("rate_limited");
    expect(JSON.stringify(warn.mock.calls)).toContain("[class-code]");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("203.0.113.7");
    warn.mockRestore();
  });

  it("counts in its own bucket, apart from sign-up, and only in an allowed one", async () => {
    const store = createMemoryRateLimitStore();
    const codes = createClassCodeLimiter(store, { attempts: 1, windowMs: 60_000 });
    await codes.take("203.0.113.7");
    expect(await codes.take("203.0.113.7")).toBe("rate_limited");
    expect(await createSignUpLimiter(store).take("203.0.113.7", "nurse@school.edu")).toEqual({
      ok: true,
    });
    const bucket = store.hits()[0]?.bucket;
    expect(bucket).toBe("class_code");
    expect(RATE_LIMIT_BUCKETS).toContain(bucket);
    // What `private.hit_rate_limit` accepts (20260925010000_shared_rate_limits.sql).
    expect(bucket).toMatch(/^[a-z][a-z0-9_]{0,47}$/);
  });
});

describe("takeClassCodeAttempt", () => {
  it("keys on the address Vercel gives", async () => {
    const store = createMemoryRateLimitStore();
    const limiter = createClassCodeLimiter(store);
    expect(await takeClassCodeAttempt(ON_VERCEL("203.0.113.7"), limiter)).toBe("ok");
    expect(store.hits()).toEqual([{ bucket: "class_code", key: "203.0.113.7" }]);
  });

  it("believes no header off the platform, so a forged address names no bucket", async () => {
    const store = createMemoryRateLimitStore();
    const forged = new Headers({ "x-forwarded-for": "203.0.113.7" });
    expect(await takeClassCodeAttempt(forged, createClassCodeLimiter(store))).toBe("ok");
    expect(store.hits()).toEqual([]);
  });
});
