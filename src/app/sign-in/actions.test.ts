import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_UNAVAILABLE } from "@/lib/auth/demoAccount";
import { SIGN_IN_EMAIL_ERROR } from "@/lib/auth/signInForm";
import { SIGN_IN_LIMITS, SIGN_IN_RATE_LIMITED } from "@/lib/auth/signInRateLimit";

/**
 * The Server Functions are thin: they read the request, count it against the per-IP limit and
 * hand the rest to src/lib. What is worth pinning here is that wiring — that each path counts
 * against its own limit before it reaches Supabase, and that a normal sign-in is untouched.
 */

const requestHeaders = new Headers({
  // Stamped by Vercel, so the limiter reads the address (see signInRateLimit.ts).
  "x-vercel-id": "iad1::test",
  "x-vercel-forwarded-for": "203.0.113.42",
  origin: "https://learn.example",
});

vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const redirected = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    redirected(to);
    throw new Error(`redirect:${to}`);
  },
}));

const signInWithOtp = vi.fn(async () => ({ error: null as { status?: number } | null }));
const signInWithPassword = vi.fn(async () => ({ error: null as unknown }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithOtp, signInWithPassword } }),
}));

const { requestSignInLink, signInAsDemo } = await import("./actions");

function emailForm(email: string): FormData {
  const form = new FormData();
  form.set("email", email);
  form.set("next", "/author");
  return form;
}

/** A fresh address per test: the limiter's counters live for the module's lifetime. */
let caller = 0;
function fromNewAddress(): void {
  caller += 1;
  requestHeaders.set("x-vercel-forwarded-for", `203.0.113.${caller}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  fromNewAddress();
});

describe("requestSignInLink", () => {
  it("asks Supabase for a link when the address is under the limit", async () => {
    const result = await requestSignInLink({ status: "idle" }, emailForm("nurse@school.edu"));
    expect(result).toEqual({ status: "sent", email: "nurse@school.edu" });
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("refuses past the email limit, and never reaches Supabase once it has", async () => {
    for (let call = 0; call < SIGN_IN_LIMITS.email.attempts; call += 1) {
      const result = await requestSignInLink({ status: "idle" }, emailForm("nurse@school.edu"));
      expect(result).toEqual({ status: "sent", email: "nurse@school.edu" });
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_LIMITS.email.attempts);

    const refused = await requestSignInLink({ status: "idle" }, emailForm("nurse@school.edu"));
    expect(refused).toEqual({ status: "error", error: SIGN_IN_RATE_LIMITED });
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_LIMITS.email.attempts);
  });

  it("spends nothing on an address that never gets past the form", async () => {
    for (let call = 0; call < SIGN_IN_LIMITS.email.attempts + 5; call += 1) {
      const result = await requestSignInLink({ status: "idle" }, emailForm("not-an-email"));
      expect(result).toEqual({ status: "error", error: SIGN_IN_EMAIL_ERROR });
    }
    const result = await requestSignInLink({ status: "idle" }, emailForm("nurse@school.edu"));
    expect(result).toEqual({ status: "sent", email: "nurse@school.edu" });
  });

  it("says the same thing when Supabase's own limit is what refused", async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { status: 429 } });
    const result = await requestSignInLink({ status: "idle" }, emailForm("nurse@school.edu"));
    expect(result).toEqual({ status: "error", error: SIGN_IN_RATE_LIMITED });
  });
});

describe("signInAsDemo", () => {
  const demoEnv = { DEMO_ACCOUNT_EMAIL: "demo@learn.test", DEMO_ACCOUNT_PASSWORD: "learn-demo" };

  it("signs in and follows the safe next when the address is under the limit", async () => {
    vi.stubEnv("DEMO_ACCOUNT_EMAIL", demoEnv.DEMO_ACCOUNT_EMAIL);
    vi.stubEnv("DEMO_ACCOUNT_PASSWORD", demoEnv.DEMO_ACCOUNT_PASSWORD);
    const form = new FormData();
    form.set("next", "/author");

    await expect(signInAsDemo({ status: "idle" }, form)).rejects.toThrow("redirect:/author");
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("refuses past the demo limit, on its own budget, without reaching Supabase", async () => {
    vi.stubEnv("DEMO_ACCOUNT_EMAIL", demoEnv.DEMO_ACCOUNT_EMAIL);
    vi.stubEnv("DEMO_ACCOUNT_PASSWORD", demoEnv.DEMO_ACCOUNT_PASSWORD);
    const form = new FormData();
    form.set("next", "/author");

    for (let call = 0; call < SIGN_IN_LIMITS.demo.attempts; call += 1) {
      await expect(signInAsDemo({ status: "idle" }, form)).rejects.toThrow("redirect:/author");
    }
    expect(signInWithPassword).toHaveBeenCalledTimes(SIGN_IN_LIMITS.demo.attempts);

    expect(await signInAsDemo({ status: "idle" }, form)).toEqual({
      status: "error",
      error: SIGN_IN_RATE_LIMITED,
    });
    expect(signInWithPassword).toHaveBeenCalledTimes(SIGN_IN_LIMITS.demo.attempts);

    // The demo budget is spent; the email path from the same address still works.
    const link = await requestSignInLink({ status: "idle" }, emailForm("nurse@school.edu"));
    expect(link).toEqual({ status: "sent", email: "nurse@school.edu" });
    vi.unstubAllEnvs();
  });

  it("still refuses a forged post when the demo is not configured", async () => {
    const form = new FormData();
    expect(await signInAsDemo({ status: "idle" }, form)).toEqual({
      status: "error",
      error: DEMO_UNAVAILABLE,
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
