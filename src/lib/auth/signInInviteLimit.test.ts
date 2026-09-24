import { describe, expect, it } from "vitest";
import {
  SIGN_IN_ADDRESS_LIMITS,
  SIGN_IN_INVITE_LIMIT,
  SIGN_IN_INVITE_TOTAL_LIMIT,
  SIGN_IN_LIMITS,
  SIGN_IN_RATE_LIMITED,
  createSignInRateLimiter,
  takeSignInInviteAttempt,
} from "./signInRateLimit";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";

/** A limiter on the in-memory fake, with a clock the test moves. */
function setup() {
  const clock = { at: 0 };
  const store = createMemoryRateLimitStore({ now: () => clock.at });
  return { clock, store, limiter: createSignInRateLimiter(store) };
}

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
  it("lets sixty students behind one address through inside one window", async () => {
    const { limiter } = setup();
    for (let student = 0; student < 60; student += 1) {
      expect(await limiter.takeInvite(IP, CLASS_A)).toEqual({ ok: true });
    }
  });

  it("allows exactly the ceiling in a window, then refuses with the sign-in wording", async () => {
    const { limiter } = setup();
    const { attempts } = SIGN_IN_INVITE_LIMIT;
    for (let call = 0; call < attempts; call += 1) {
      expect(await limiter.takeInvite(IP, CLASS_A)).toEqual({ ok: true });
    }
    expect(await limiter.takeInvite(IP, CLASS_A)).toEqual({
      ok: false,
      error: SIGN_IN_RATE_LIMITED,
    });
  });

  it("keeps each class, and each caller, on its own counter", async () => {
    const { limiter } = setup();
    for (let call = 0; call <= SIGN_IN_INVITE_LIMIT.attempts; call += 1) {
      await limiter.takeInvite(IP, CLASS_A);
    }
    expect((await limiter.takeInvite(IP, CLASS_A)).ok).toBe(false);
    expect(await limiter.takeInvite(IP, CLASS_B)).toEqual({ ok: true });
    expect(await limiter.takeInvite("198.51.100.9", CLASS_A)).toEqual({ ok: true });
  });

  it("caps one caller across every class it holds a link to, so budgets do not stack", async () => {
    const { limiter } = setup();
    const classes = Array.from(
      { length: 10 },
      (_, n) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`,
    );
    let granted = 0;
    for (const classId of classes) {
      for (let call = 0; call < SIGN_IN_INVITE_LIMIT.attempts; call += 1) {
        if ((await limiter.takeInvite(IP, classId)).ok) granted += 1;
      }
    }
    expect(granted).toBe(SIGN_IN_INVITE_TOTAL_LIMIT.attempts);
    // Two whole classes behind one address still fit.
    expect(SIGN_IN_INVITE_TOTAL_LIMIT.attempts).toBeGreaterThanOrEqual(2 * 60);
    expect(await limiter.takeInvite("198.51.100.9", classes[0] ?? "")).toEqual({ ok: true });
  });

  it("does not spend, or draw on, the plain sign-in budget", async () => {
    const { limiter } = setup();
    for (let call = 0; call < SIGN_IN_INVITE_LIMIT.attempts; call += 1) {
      await limiter.takeInvite(IP, CLASS_A);
    }
    // Plain sign-in from the same address still has every one of its thirty.
    for (let call = 0; call < SIGN_IN_LIMITS.email.attempts; call += 1) {
      expect(await limiter.take(IP, "email")).toEqual({ ok: true });
    }
    expect((await limiter.take(IP, "email")).ok).toBe(false);
    // And an exhausted plain budget leaves the class's own budget whole.
    expect(await limiter.takeInvite(IP, CLASS_B)).toEqual({ ok: true });
  });

  it("leaves the per-recipient budgets exactly where they were", async () => {
    const { limiter } = setup();
    for (let call = 0; call < SIGN_IN_INVITE_LIMIT.attempts; call += 1) {
      await limiter.takeInvite(IP, CLASS_A);
    }
    const email = "student@school.edu";
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.perCaller.attempts; call += 1) {
      expect(await limiter.takeAddress(IP, email)).toBe("send");
    }
    expect(await limiter.takeAddress(IP, email)).toBe("over-caller-budget");
  });

  it("starts a fresh window once the old one has run out", async () => {
    const { limiter, clock } = setup();
    const { attempts, windowMs } = SIGN_IN_INVITE_LIMIT;
    for (let call = 0; call <= attempts; call += 1) await limiter.takeInvite(IP, CLASS_A);
    clock.at = windowMs - 1;
    expect((await limiter.takeInvite(IP, CLASS_A)).ok).toBe(false);
    clock.at = windowMs;
    expect(await limiter.takeInvite(IP, CLASS_A)).toEqual({ ok: true });
  });

  it("does not limit a caller nothing identifies, as the per-IP counter does not", async () => {
    const { limiter } = setup();
    for (let call = 0; call < SIGN_IN_INVITE_LIMIT.attempts + 5; call += 1) {
      expect(await limiter.takeInvite(null, CLASS_A)).toEqual({ ok: true });
    }
  });
});

describe("takeSignInInviteAttempt", () => {
  it("counts against the caller the request headers name", async () => {
    const { limiter } = setup();
    const headers = request({ "x-forwarded-for": "203.0.113.77" });
    for (let call = 0; call < SIGN_IN_INVITE_LIMIT.attempts; call += 1) {
      expect(await takeSignInInviteAttempt(headers, CLASS_A, limiter)).toEqual({ ok: true });
    }
    expect((await takeSignInInviteAttempt(headers, CLASS_A, limiter)).ok).toBe(false);
    const elsewhere = request({ "x-forwarded-for": "198.51.100.9" });
    expect(await takeSignInInviteAttempt(elsewhere, CLASS_A, limiter)).toEqual({ ok: true });
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
