import { describe, expect, it, vi } from "vitest";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import {
  createSignInPasswordLimiter,
  SIGN_IN_PASSWORD_LIMITS,
  SIGN_IN_PASSWORD_TRIES_SPENT,
} from "./passwordLimit";
import { createSignInCodeLimiter, SIGN_IN_CODE_LIMITS } from "./signInCodeLimit";

const SPENT = { ok: false, error: SIGN_IN_PASSWORD_TRIES_SPENT };

describe("createSignInPasswordLimiter", () => {
  it("gives one caller five tries at one address, leaving others theirs", async () => {
    const limiter = createSignInPasswordLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_IN_PASSWORD_LIMITS.perPair.attempts; i += 1) {
      expect(await limiter.take("203.0.113.7", "nurse@school.edu")).toEqual({ ok: true });
    }
    expect(await limiter.take("203.0.113.7", "Nurse@School.edu")).toEqual(SPENT);
    expect(await limiter.take("198.51.100.9", "nurse@school.edu")).toEqual({ ok: true });
    expect(await limiter.take("203.0.113.7", "other@school.edu")).toEqual({ ok: true });
  });

  it("holds a ceiling at one address across networks, and logs it without the address", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limiter = createSignInPasswordLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < SIGN_IN_PASSWORD_LIMITS.perAddress.attempts; i += 1) {
      expect(await limiter.take(`203.0.113.${i + 1}`, "nurse@school.edu")).toEqual({ ok: true });
    }
    expect(await limiter.take("198.51.100.9", "nurse@school.edu")).toEqual(SPENT);
    expect(limiter.ceilingRefusals()).toBe(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("school.edu");
    warn.mockRestore();
  });

  it("lets a whole class sign in from one campus address", async () => {
    const limiter = createSignInPasswordLimiter(createMemoryRateLimitStore());
    for (let i = 0; i < 120; i += 1) {
      expect(await limiter.take("203.0.113.7", `student${i}@school.edu`)).toEqual({ ok: true });
    }
  });

  it("counts apart from the one-time code, so spending one leaves the other", async () => {
    const store = createMemoryRateLimitStore();
    const codes = createSignInCodeLimiter(store);
    for (let i = 0; i <= SIGN_IN_CODE_LIMITS.perPair.attempts; i += 1) {
      await codes.take("203.0.113.7", "nurse@school.edu");
    }
    const passwords = createSignInPasswordLimiter(store);
    expect(await passwords.take("203.0.113.7", "nurse@school.edu")).toEqual({ ok: true });
  });
});
