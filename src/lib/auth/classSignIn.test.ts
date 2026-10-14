import { describe, expect, it } from "vitest";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { createSignInCodeLimiter, SIGN_IN_CODE_TRIES_SPENT } from "./signInCodeLimit";
import { createSignInRateLimiter } from "./signInRateLimit";
import { createSignUpLimiter, SIGN_UP_TRIES_SPENT } from "./signUpLimit";

/**
 * #409: a whole class signs in from one public address (a campus NAT). Every student is a
 * different account, so the per-address budgets must admit them all, while the tiers keyed on the
 * address and the account together, which are what stop guessing, stay exactly where they were.
 * The counts below are written out, not read from the limits, so that loosening a guessing tier
 * fails here.
 */
const CAMPUS = "203.0.113.7";
const CLASS_SIZE = 100;
const student = (i: number) => `student${i}@school.edu`;

describe("a class of 100 behind one address, in one five-minute window (#409)", () => {
  it("lets every student ask for a sign-in link", async () => {
    const limiter = createSignInRateLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < CLASS_SIZE; i += 1) {
      expect(await limiter.take(CAMPUS, "email")).toEqual({ ok: true });
      expect(await limiter.takeAddress(CAMPUS, student(i))).toBe("send");
    }
  });

  it("lets every student type their one-time code", async () => {
    const limiter = createSignInCodeLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < CLASS_SIZE; i += 1) {
      expect(await limiter.take(CAMPUS, student(i))).toEqual({ ok: true });
    }
  });

  it("lets every student sign up", async () => {
    const limiter = createSignUpLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < CLASS_SIZE; i += 1) {
      expect(await limiter.take(CAMPUS, student(i))).toEqual({ ok: true });
    }
  });
});

describe("one address at one account is stopped at the same count as before (#409)", () => {
  const victim = "nurse@school.edu";

  it("sends three links, then goes quiet", async () => {
    const limiter = createSignInRateLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < 3; i += 1) {
      expect(await limiter.take(CAMPUS, "email")).toEqual({ ok: true });
      expect(await limiter.takeAddress(CAMPUS, victim)).toBe("send");
    }
    expect(await limiter.takeAddress(CAMPUS, victim)).toBe("over-caller-budget");
  });

  it("allows three code tries, then refuses", async () => {
    const limiter = createSignInCodeLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < 3; i += 1) {
      expect(await limiter.take(CAMPUS, victim)).toEqual({ ok: true });
    }
    expect(await limiter.take(CAMPUS, victim)).toEqual({
      ok: false,
      error: SIGN_IN_CODE_TRIES_SPENT,
    });
  });

  it("allows five sign-up tries, then refuses", async () => {
    const limiter = createSignUpLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < 5; i += 1) {
      expect(await limiter.take(CAMPUS, victim)).toEqual({ ok: true });
    }
    expect(await limiter.take(CAMPUS, victim)).toEqual({ ok: false, error: SIGN_UP_TRIES_SPENT });
  });

  it("keeps each address's ceiling across every network where it was", async () => {
    const links = createSignInRateLimiter(createMemoryRateLimitStore());
    const codes = createSignInCodeLimiter(createMemoryRateLimitStore());
    const signUps = createSignUpLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < 15; i += 1) {
      const caller = `198.51.100.${i + 1}`;
      if (i < 12) expect(await links.takeAddress(caller, victim)).toBe("send");
      expect(await codes.take(caller, victim)).toEqual({ ok: true });
      if (i < 10) expect(await signUps.take(caller, victim)).toEqual({ ok: true });
    }
    expect(await links.takeAddress("192.0.2.1", victim)).toBe("over-address-ceiling");
    expect((await codes.take("192.0.2.1", victim)).ok).toBe(false);
    expect((await signUps.take("192.0.2.1", victim)).ok).toBe(false);
  });
});
