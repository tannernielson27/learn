import { describe, expect, it } from "vitest";
import {
  SIGN_IN_ADDRESS_LIMITS,
  SIGN_IN_INVITE_LIMIT,
  SIGN_IN_LIMITS,
  SIGN_IN_RATE_LIMITED,
  createSignInRateLimiter,
  takeSignInInviteAttempt,
} from "./signInRateLimit";

/**
 * #217: the per-(class, caller) budget a request earns only once its invite token has resolved.
 * A class on campus Wi-Fi shares one public address, so the per-IP email budget (30) refused the
 * thirty-first student on the first day. These pin the new counter and, as much, what it leaves
 * alone.
 */

const IP = "203.0.113.7";
const CLASS_A = "00000000-0000-4000-8000-0000000000a1";
const CLASS_B = "00000000-0000-4000-8000-0000000000b2";

function request(headers: Record<string, string>): Headers {
  return new Headers({ "x-vercel-id": "iad1::abc123", ...headers });
}

describe("the per-class invite budget", () => {
  it("lets sixty students behind one address through inside one window", () => {
    const limiter = createSignInRateLimiter();
    for (let student = 0; student < 60; student += 1) {
      expect(limiter.takeInvite(IP, CLASS_A, student * 1_000)).toEqual({ ok: true });
    }
  });

  it("allows exactly the ceiling in a window, then refuses with the sign-in wording", () => {
    const limiter = createSignInRateLimiter();
    const { attempts } = SIGN_IN_INVITE_LIMIT;
    for (let call = 0; call < attempts; call += 1) {
      expect(limiter.takeInvite(IP, CLASS_A, call)).toEqual({ ok: true });
    }
    expect(limiter.takeInvite(IP, CLASS_A, attempts)).toEqual({
      ok: false,
      error: SIGN_IN_RATE_LIMITED,
    });
  });

  it("keeps each class, and each caller, on its own counter", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call <= SIGN_IN_INVITE_LIMIT.attempts; call += 1) {
      limiter.takeInvite(IP, CLASS_A, call);
    }
    expect(limiter.takeInvite(IP, CLASS_A, 0).ok).toBe(false);
    expect(limiter.takeInvite(IP, CLASS_B, 0)).toEqual({ ok: true });
    expect(limiter.takeInvite("198.51.100.9", CLASS_A, 0)).toEqual({ ok: true });
  });

  it("does not spend, or draw on, the plain sign-in budget", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_INVITE_LIMIT.attempts; call += 1) {
      limiter.takeInvite(IP, CLASS_A, call);
    }
    // Plain sign-in from the same address still has every one of its thirty.
    for (let call = 0; call < SIGN_IN_LIMITS.email.attempts; call += 1) {
      expect(limiter.take(IP, "email", call)).toEqual({ ok: true });
    }
    expect(limiter.take(IP, "email", 0).ok).toBe(false);
    // And an exhausted plain budget leaves the class's own budget whole.
    expect(limiter.takeInvite(IP, CLASS_B, 0)).toEqual({ ok: true });
  });

  it("leaves the per-recipient budgets exactly where they were", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_INVITE_LIMIT.attempts; call += 1) {
      limiter.takeInvite(IP, CLASS_A, call);
    }
    const email = "student@school.edu";
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.perCaller.attempts; call += 1) {
      expect(limiter.takeAddress(IP, email, call)).toBe("send");
    }
    expect(limiter.takeAddress(IP, email, 0)).toBe("over-caller-budget");
  });

  it("starts a fresh window once the old one has run out", () => {
    const limiter = createSignInRateLimiter();
    const { attempts, windowMs } = SIGN_IN_INVITE_LIMIT;
    for (let call = 0; call <= attempts; call += 1) limiter.takeInvite(IP, CLASS_A, 0);
    expect(limiter.takeInvite(IP, CLASS_A, windowMs - 1).ok).toBe(false);
    expect(limiter.takeInvite(IP, CLASS_A, windowMs)).toEqual({ ok: true });
  });

  it("does not limit a caller nothing identifies, as the per-IP counter does not", () => {
    const limiter = createSignInRateLimiter();
    for (let call = 0; call < SIGN_IN_INVITE_LIMIT.attempts + 5; call += 1) {
      expect(limiter.takeInvite(null, CLASS_A, call)).toEqual({ ok: true });
    }
  });
});

describe("takeSignInInviteAttempt", () => {
  it("counts against the caller the request headers name", () => {
    const limiter = createSignInRateLimiter();
    const headers = request({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_INVITE_LIMIT.attempts; call += 1) {
      expect(takeSignInInviteAttempt(headers, CLASS_A, limiter)).toEqual({ ok: true });
    }
    expect(takeSignInInviteAttempt(headers, CLASS_A, limiter).ok).toBe(false);
    const elsewhere = request({ "x-forwarded-for": "198.51.100.9" });
    expect(takeSignInInviteAttempt(elsewhere, CLASS_A, limiter)).toEqual({ ok: true });
  });
});

describe("the chosen invite ceiling", () => {
  it("runs in the same five-minute window as the rest", () => {
    expect(SIGN_IN_INVITE_LIMIT.windowMs).toBe(SIGN_IN_LIMITS.email.windowMs);
  });

  it("gives a sixty-student class two tries each, and is well above the plain per-IP budget", () => {
    expect(SIGN_IN_INVITE_LIMIT.attempts).toBeGreaterThanOrEqual(120);
    expect(SIGN_IN_INVITE_LIMIT.attempts).toBeGreaterThan(SIGN_IN_LIMITS.email.attempts);
  });
});
