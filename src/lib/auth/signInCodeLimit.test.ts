import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGN_IN_RATE_LIMITED, SIGN_IN_UNAVAILABLE } from "./signInRateLimit";
import {
  SIGN_IN_CODE_LIMITS,
  SIGN_IN_CODE_TRIES_SPENT,
  createSignInCodeLimiter,
} from "./signInCodeLimit";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { ceilingAlertPayload } from "@/lib/observability/ceilingAlert";

// #159: a ceiling refusal is reported to Sentry. Mocked so the exact payload can be read back.
const { captureMessage, flush } = vi.hoisted(() => ({
  captureMessage: vi.fn(),
  flush: vi.fn(async () => true),
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage, flush }));

// #159: no test may inherit a real SENTRY_DSN from the shell; the ones that need one stub it.
beforeEach(() => {
  vi.stubEnv("SENTRY_DSN", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createSignInCodeLimiter (#306)", () => {
  it("gives one caller three tries at one address, leaving others theirs", async () => {
    const limiter = createSignInCodeLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_IN_CODE_LIMITS.perPair.attempts; i += 1) {
      expect(await limiter.take("203.0.113.7", "nurse@school.edu")).toEqual({ ok: true });
    }
    expect(await limiter.take("203.0.113.7", "Nurse@School.edu")).toEqual({
      ok: false,
      error: SIGN_IN_CODE_TRIES_SPENT,
    });
    // The owner, on another network, is not locked out by that caller (#306 review).
    expect(await limiter.take("198.51.100.9", "nurse@school.edu")).toEqual({ ok: true });
  });

  it("holds a ceiling at one address across networks, and logs it without the address", async () => {
    vi.stubEnv("SENTRY_DSN", "https://0123456789abcdef0123456789abcdef@o0.ingest.us.sentry.io/0");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limiter = createSignInCodeLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_IN_CODE_LIMITS.perAddress.attempts; i += 1) {
      expect(await limiter.take(`203.0.113.${i + 1}`, "nurse@school.edu")).toEqual({ ok: true });
    }
    expect(await limiter.take("198.51.100.9", "nurse@school.edu")).toEqual({
      ok: false,
      error: SIGN_IN_CODE_TRIES_SPENT,
    });
    expect(limiter.ceilingRefusals()).toBe(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("school.edu");
    // #159: and to Sentry as one fixed warning naming the path. Neither the address, any part of it,
    // nor a caller's IP may be in what Sentry was handed.
    await vi.waitFor(() => expect(flush).toHaveBeenCalledTimes(1));
    expect(captureMessage.mock.calls).toEqual([ceilingAlertPayload("code")]);
    const payload = JSON.stringify([captureMessage.mock.calls, flush.mock.calls]);
    for (const secret of ["nurse@school.edu", "nurse", "school.edu", "198.51.100", "203.0.113"]) {
      expect(payload).not.toContain(secret);
    }
    // Another address is untouched.
    expect(await limiter.take("198.51.100.9", "other@school.edu")).toEqual({ ok: true });
    warn.mockRestore();
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
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
