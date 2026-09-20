import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SIGN_IN_LIMITS,
  SIGN_IN_RATE_LIMITED,
  UNIDENTIFIED_CALLER,
  clientIp,
  createSignInRateLimiter,
  takeSignInAttempt,
} from "./signInRateLimit";

function request(headers: Record<string, string>): Headers {
  return new Headers(headers);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clientIp", () => {
  it("prefers the header Vercel sets itself", () => {
    const headers = request({
      "x-vercel-forwarded-for": "203.0.113.7",
      "x-real-ip": "198.51.100.4",
      "x-forwarded-for": "198.51.100.4",
    });
    expect(clientIp(headers, true)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to x-forwarded-for", () => {
    expect(clientIp(request({ "x-real-ip": "198.51.100.4" }), true)).toBe("198.51.100.4");
    expect(clientIp(request({ "x-forwarded-for": "198.51.100.5" }), true)).toBe("198.51.100.5");
  });

  it("takes the first hop of a multi-hop list", () => {
    const headers = request({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" });
    expect(clientIp(headers, true)).toBe("203.0.113.7");
  });

  it("keeps an IPv6 address whole and lower-cased", () => {
    const headers = request({ "x-forwarded-for": "2001:DB8::8A2E:370:7334" });
    expect(clientIp(headers, true)).toBe("2001:db8::8a2e:370:7334");
  });

  it("caps an absurdly long value so one caller cannot grow the key", () => {
    const headers = request({ "x-forwarded-for": "9".repeat(500) });
    expect(clientIp(headers, true)).toHaveLength(64);
  });

  it("buckets a deployed request with no IP header under one shared key", () => {
    expect(clientIp(request({}), true)).toBe(UNIDENTIFIED_CALLER);
    expect(clientIp(request({ "x-forwarded-for": "  ,  " }), true)).toBe(UNIDENTIFIED_CALLER);
  });

  it("reports no IP off the platform, where nothing in front identifies the caller", () => {
    expect(clientIp(request({}), false)).toBeNull();
  });

  it("decides deployed-or-not from VERCEL when it is not told", () => {
    vi.stubEnv("VERCEL", "");
    expect(clientIp(request({}))).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(clientIp(request({}))).toBe(UNIDENTIFIED_CALLER);
  });
});

describe("createSignInRateLimiter", () => {
  const ip = "203.0.113.7";

  it("lets a normal sign-in through", () => {
    const limiter = createSignInRateLimiter();
    expect(limiter.take(ip, "email", 0)).toEqual({ ok: true });
    expect(limiter.take(ip, "demo", 0)).toEqual({ ok: true });
  });

  it("allows exactly the email limit in a window, then refuses", () => {
    const limiter = createSignInRateLimiter();
    const { attempts } = SIGN_IN_LIMITS.email;
    for (let call = 0; call < attempts; call += 1) {
      expect(limiter.take(ip, "email", call)).toEqual({ ok: true });
    }
    expect(limiter.take(ip, "email", attempts)).toEqual({
      ok: false,
      error: SIGN_IN_RATE_LIMITED,
    });
  });

  it("allows exactly the demo limit in a window, then refuses", () => {
    const limiter = createSignInRateLimiter();
    const { attempts } = SIGN_IN_LIMITS.demo;
    for (let call = 0; call < attempts; call += 1) {
      expect(limiter.take(ip, "demo", call)).toEqual({ ok: true });
    }
    expect(limiter.take(ip, "demo", attempts)).toEqual({ ok: false, error: SIGN_IN_RATE_LIMITED });
  });

  it("says the same thing however the limit was reached, revealing nothing about an account", () => {
    expect(SIGN_IN_RATE_LIMITED).toBe(
      "Too many sign-in attempts from this network. Wait a few minutes, then try again.",
    );
    expect(SIGN_IN_RATE_LIMITED).not.toMatch(/account|email|password|exist/i);
  });

  it("spends the two paths' budgets separately", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 5; call += 1) {
      limiter.take(ip, "demo", call);
    }
    expect(limiter.take(ip, "demo", 0)).toEqual({ ok: false, error: SIGN_IN_RATE_LIMITED });
    expect(limiter.take(ip, "email", 0)).toEqual({ ok: true });
  });

  it("counts each address on its own, so one heavy caller cannot lock out another", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 1; call += 1) {
      limiter.take(ip, "demo", call);
    }
    expect(limiter.take(ip, "demo", 0)).toEqual({ ok: false, error: SIGN_IN_RATE_LIMITED });
    expect(limiter.take("198.51.100.4", "demo", 0)).toEqual({ ok: true });
  });

  it("starts a fresh window once the old one has run out", () => {
    const limiter = createSignInRateLimiter();
    const { attempts, windowMs } = SIGN_IN_LIMITS.demo;
    for (let call = 0; call <= attempts; call += 1) limiter.take(ip, "demo", 0);
    expect(limiter.take(ip, "demo", windowMs - 1)).toEqual({
      ok: false,
      error: SIGN_IN_RATE_LIMITED,
    });
    expect(limiter.take(ip, "demo", windowMs)).toEqual({ ok: true });
  });

  it("does not let hammering push the window out, so the wait never grows", () => {
    const limiter = createSignInRateLimiter();
    const { attempts, windowMs } = SIGN_IN_LIMITS.demo;
    for (let call = 0; call < attempts + 200; call += 1) limiter.take(ip, "demo", call);
    // The window still ends one length after the first attempt, not after the last.
    expect(limiter.take(ip, "demo", windowMs)).toEqual({ ok: true });
  });

  it("does not limit a caller nothing identifies", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts + 10; call += 1) {
      expect(limiter.take(null, "demo", call)).toEqual({ ok: true });
    }
  });

  it("forgets finished windows instead of growing without bound", () => {
    const limiter = createSignInRateLimiter();
    for (let caller = 0; caller < 12_000; caller += 1) limiter.take(`10.0.${caller}`, "email", 0);
    expect(limiter.size()).toBeLessThanOrEqual(10_000);
  });
});

describe("takeSignInAttempt", () => {
  it("counts the attempt against the address the request came from", () => {
    const headers = request({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts; call += 1) {
      expect(takeSignInAttempt(headers, "demo")).toEqual({ ok: true });
    }
    expect(takeSignInAttempt(headers, "demo")).toEqual({
      ok: false,
      error: SIGN_IN_RATE_LIMITED,
    });
    // The email path still has its own budget, and another address is untouched.
    expect(takeSignInAttempt(headers, "email")).toEqual({ ok: true });
    expect(takeSignInAttempt(request({ "x-forwarded-for": "198.51.100.9" }), "demo")).toEqual({
      ok: true,
    });
  });
});

describe("the chosen limits", () => {
  it("fits both paths inside Supabase's own 30 sign-ins per 5 minutes per IP", () => {
    expect(SIGN_IN_LIMITS.email.windowMs).toBe(5 * 60_000);
    expect(SIGN_IN_LIMITS.demo.windowMs).toBe(5 * 60_000);
    expect(SIGN_IN_LIMITS.email.attempts + SIGN_IN_LIMITS.demo.attempts).toBeLessThanOrEqual(30);
  });
});
