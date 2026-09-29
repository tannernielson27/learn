import { describe, expect, it } from "vitest";
import { SIGN_IN_RATE_LIMITED, SIGN_IN_UNAVAILABLE } from "./signInRateLimit";
import {
  SIGN_IN_CODE_LIMITS,
  SIGN_IN_CODE_TRIES_SPENT,
  createSignInCodeLimiter,
} from "./signInCodeLimit";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";

describe("createSignInCodeLimiter (#306)", () => {
  it("allows a handful of tries at one address, then stops them from anywhere", async () => {
    const limiter = createSignInCodeLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_IN_CODE_LIMITS.perAddress.attempts; i += 1) {
      const ip = `203.0.113.${i + 1}`;
      expect(await limiter.take(ip, "nurse@school.edu")).toEqual({ ok: true });
    }
    expect(await limiter.take("198.51.100.9", "Nurse@School.edu")).toEqual({
      ok: false,
      error: SIGN_IN_CODE_TRIES_SPENT,
    });
    // Another address is untouched.
    expect(await limiter.take("198.51.100.9", "other@school.edu")).toEqual({ ok: true });
  });

  it("caps one caller across many addresses with the network message", async () => {
    const limiter = createSignInCodeLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_IN_CODE_LIMITS.perCaller.attempts; i += 1) {
      expect(await limiter.take("203.0.113.7", `n${i}@school.edu`)).toEqual({ ok: true });
    }
    expect(await limiter.take("203.0.113.7", "fresh@school.edu")).toEqual({
      ok: false,
      error: SIGN_IN_RATE_LIMITED,
    });
  });

  it("still counts the address off the platform, where there is no caller", async () => {
    const limiter = createSignInCodeLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_IN_CODE_LIMITS.perAddress.attempts; i += 1) {
      await limiter.take(null, "nurse@school.edu");
    }
    expect(await limiter.take(null, "nurse@school.edu")).toMatchObject({ ok: false });
  });

  it("refuses when the shared store cannot answer", async () => {
    const store = createMemoryRateLimitStore();
    store.failWith(new RateLimitUnavailableError("test"));
    const limiter = createSignInCodeLimiter(store);
    expect(await limiter.take("203.0.113.7", "nurse@school.edu")).toEqual({
      ok: false,
      error: SIGN_IN_UNAVAILABLE,
    });
  });
});
