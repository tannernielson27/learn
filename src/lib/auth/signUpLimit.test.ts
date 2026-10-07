import { describe, expect, it, vi } from "vitest";
import { RATE_LIMIT_BUCKETS, RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { createSignInPasswordLimiter, SIGN_IN_PASSWORD_LIMITS } from "./passwordLimit";
import { SIGN_IN_RATE_LIMITED, SIGN_IN_UNAVAILABLE } from "./signInRateLimit";
import {
  createSignUpLimiter,
  SIGN_UP_LIMITS,
  SIGN_UP_RATE_LIMITED,
  SIGN_UP_TRIES_SPENT,
  SIGN_UP_UNAVAILABLE,
  takeSignUpAttempt,
} from "./signUpLimit";

const SPENT = { ok: false, error: SIGN_UP_TRIES_SPENT };
const ON_VERCEL = (ip: string) => new Headers({ "x-vercel-id": "iad1::abc", "x-real-ip": ip });

describe("createSignUpLimiter (#359)", () => {
  it("counts in five-minute windows", () => {
    for (const limit of Object.values(SIGN_UP_LIMITS)) expect(limit.windowMs).toBe(5 * 60_000);
  });

  it("refuses one caller past its budget across addresses, and leaves other callers theirs", async () => {
    const limiter = createSignUpLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_UP_LIMITS.perCaller.attempts; i += 1) {
      expect(await limiter.take("203.0.113.7", `person${i}@school.edu`)).toEqual({ ok: true });
    }
    expect(await limiter.take("203.0.113.7", "one-more@school.edu")).toEqual({
      ok: false,
      error: SIGN_UP_RATE_LIMITED,
    });
    expect(await limiter.take("198.51.100.9", "one-more@school.edu")).toEqual({ ok: true });
  });

  it("refuses one caller hammering one address, whatever its letter case", async () => {
    const limiter = createSignUpLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_UP_LIMITS.perPair.attempts; i += 1) {
      expect(await limiter.take("203.0.113.7", "nurse@school.edu")).toEqual({ ok: true });
    }
    expect(await limiter.take("203.0.113.7", " Nurse@School.edu")).toEqual(SPENT);
    expect(await limiter.take("203.0.113.7", "other@school.edu")).toEqual({ ok: true });
  });

  it("holds a ceiling on one address across networks, and logs it without the address", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limiter = createSignUpLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_UP_LIMITS.perAddress.attempts; i += 1) {
      expect(await limiter.take(`203.0.113.${i + 1}`, "nurse@school.edu")).toEqual({ ok: true });
    }
    expect(await limiter.take("198.51.100.9", "nurse@school.edu")).toEqual(SPENT);
    expect(limiter.ceilingRefusals()).toBe(1);
    expect(JSON.stringify(warn.mock.calls)).toContain("[sign-up]");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("school.edu");
    warn.mockRestore();
  });

  it("still counts the address when there is no caller to key on (off Vercel)", async () => {
    const limiter = createSignUpLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_UP_LIMITS.perAddress.attempts; i += 1) {
      expect(await limiter.take(null, "nurse@school.edu")).toEqual({ ok: true });
    }
    expect(await limiter.take(null, "nurse@school.edu")).toEqual(SPENT);
  });

  it("fails closed, in sign-up's own words, when the store cannot answer", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createMemoryRateLimitStore();
    store.failWith(new RateLimitUnavailableError("PGRST000"));
    const limiter = createSignUpLimiter(store);
    expect(await limiter.take("203.0.113.7", "nurse@school.edu")).toEqual({
      ok: false,
      error: SIGN_UP_UNAVAILABLE,
    });
    expect(await limiter.take(null, "nurse@school.edu")).toEqual({
      ok: false,
      error: SIGN_UP_UNAVAILABLE,
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("school.edu");
    error.mockRestore();
  });

  it("counts in its own buckets, apart from password tries, and only in allowed ones", async () => {
    const store = createMemoryRateLimitStore();
    const signUps = createSignUpLimiter(store);
    for (let i = 0; i <= SIGN_UP_LIMITS.perPair.attempts; i += 1) {
      await signUps.take("203.0.113.7", "nurse@school.edu");
    }
    const passwords = createSignInPasswordLimiter(store);
    expect(await passwords.take("203.0.113.7", "nurse@school.edu")).toEqual({ ok: true });
    const used = new Set(store.hits().map((hit) => hit.bucket));
    expect([...used].filter((bucket) => bucket.startsWith("sign_up")).sort()).toEqual([
      "sign_up",
      "sign_up_address",
      "sign_up_pair",
    ]);
    for (const bucket of used) {
      expect(RATE_LIMIT_BUCKETS).toContain(bucket);
      // What `private.hit_rate_limit` accepts (20260925010000_shared_rate_limits.sql).
      expect(bucket).toMatch(/^[a-z][a-z0-9_]{0,47}$/);
    }
  });
});

describe("the other try limiters keep their own words", () => {
  it("still says sign-in on a password try", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const limits = {
      ...SIGN_IN_PASSWORD_LIMITS,
      perCaller: { attempts: 1, windowMs: 60_000 },
    } as unknown as typeof SIGN_IN_PASSWORD_LIMITS;
    const store = createMemoryRateLimitStore();
    const limiter = createSignInPasswordLimiter(store, limits);
    await limiter.take("203.0.113.7", "a@school.edu");
    expect(await limiter.take("203.0.113.7", "b@school.edu")).toEqual({
      ok: false,
      error: SIGN_IN_RATE_LIMITED,
    });
    store.failWith(new RateLimitUnavailableError("PGRST000"));
    expect(await limiter.take("203.0.113.7", "c@school.edu")).toEqual({
      ok: false,
      error: SIGN_IN_UNAVAILABLE,
    });
    expect(JSON.stringify(error.mock.calls)).toContain("[sign-in]");
    error.mockRestore();
  });
});

describe("takeSignUpAttempt (#359)", () => {
  it("keys on the address Vercel gives, and on the email", async () => {
    const store = createMemoryRateLimitStore();
    const limiter = createSignUpLimiter(store);
    expect(await takeSignUpAttempt(ON_VERCEL("203.0.113.7"), "Nurse@School.edu", limiter)).toEqual({
      ok: true,
    });
    expect(store.hits()).toEqual([
      { bucket: "sign_up", key: "203.0.113.7" },
      { bucket: "sign_up_pair", key: "203.0.113.7|nurse@school.edu" },
      { bucket: "sign_up_address", key: "nurse@school.edu" },
    ]);
  });

  it("counts only the address off the platform, where no header can be believed", async () => {
    const store = createMemoryRateLimitStore();
    const forged = new Headers({ "x-forwarded-for": "203.0.113.7" });
    await takeSignUpAttempt(forged, "nurse@school.edu", createSignUpLimiter(store));
    expect(store.hits()).toEqual([{ bucket: "sign_up_address", key: "nurse@school.edu" }]);
  });
});
