import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_UNAVAILABLE } from "@/lib/auth/demoAccount";
import { SIGN_IN_EMAIL_ERROR } from "@/lib/auth/signInForm";
import {
  SIGN_IN_ADDRESS_LIMIT,
  SIGN_IN_LIMITS,
  SIGN_IN_RATE_LIMITED,
} from "@/lib/auth/signInRateLimit";

const SEND_FAILED = "The email could not be sent just now. Try again in a moment.";

/**
 * The Server Functions are thin: they read the request, count it against the two limits and hand
 * the rest to src/lib. What is worth pinning here is that wiring — that each path counts against
 * its own limit before it reaches Supabase, and that a normal sign-in is untouched.
 *
 * The other thing pinned here is what #139 turns on: the result the caller sees must not say
 * whether an address has an account. So several of these tests assert not what one path returns
 * but that two paths return the same thing.
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

type OtpError = { status?: number; code?: string; message?: string };
const signInWithOtp = vi.fn(async () => ({ error: null as OtpError | null }));
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

/** A fresh caller per test: the limiter's counters live for the module's lifetime. */
let caller = 0;
function fromNewAddress(): void {
  caller += 1;
  requestHeaders.set("x-vercel-forwarded-for", `203.0.113.${caller}`);
}

/** And a fresh recipient, for the same reason: the per-address budget is module-wide too. */
let recipient = 0;
function newRecipient(): string {
  recipient += 1;
  return `nurse${recipient}@school.edu`;
}

/** The action logs a real failure and nothing else. Silenced, and asserted on where it matters. */
const logged = vi.spyOn(console, "error").mockImplementation(() => {});

let inbox = "";

beforeEach(() => {
  vi.clearAllMocks();
  fromNewAddress();
  inbox = newRecipient();
});

describe("requestSignInLink", () => {
  it("asks Supabase for a link when the address is under the limit", async () => {
    const result = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(result).toEqual({ status: "sent", email: inbox });
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("does not ask Supabase to create the account, because sign-up is not self-serve", async () => {
    await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ shouldCreateUser: false }),
      }),
    );
  });

  it("refuses past the email limit, and never reaches Supabase once it has", async () => {
    // A recipient per call, so it is the caller's budget of 30 being spent and not one inbox's.
    for (let call = 0; call < SIGN_IN_LIMITS.email.attempts; call += 1) {
      const to = newRecipient();
      const result = await requestSignInLink({ status: "idle" }, emailForm(to));
      expect(result).toEqual({ status: "sent", email: to });
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_LIMITS.email.attempts);

    const refused = await requestSignInLink({ status: "idle" }, emailForm(newRecipient()));
    expect(refused).toEqual({ status: "error", error: SIGN_IN_RATE_LIMITED });
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_LIMITS.email.attempts);
  });

  it("spends nothing on an address that never gets past the form", async () => {
    for (let call = 0; call < SIGN_IN_LIMITS.email.attempts + 5; call += 1) {
      const result = await requestSignInLink({ status: "idle" }, emailForm("not-an-email"));
      expect(result).toEqual({ status: "error", error: SIGN_IN_EMAIL_ERROR });
    }
    const result = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(result).toEqual({ status: "sent", email: inbox });
  });

  it("says the same thing when Supabase's own limit is what refused", async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { status: 429 } });
    const result = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(result).toEqual({ status: "error", error: SIGN_IN_RATE_LIMITED });
  });
});

/**
 * #139. Each of these compares two paths rather than asserting one, because the property being
 * defended is that the caller cannot tell them apart.
 */
describe("requestSignInLink does not say which addresses have accounts", () => {
  it("answers an address with no account exactly as an address with one", async () => {
    const known = await requestSignInLink({ status: "idle" }, emailForm(inbox));

    const stranger = newRecipient();
    signInWithOtp.mockResolvedValueOnce({
      error: { status: 422, code: "otp_disabled", message: "Signups not allowed for otp" },
    });
    const unknown = await requestSignInLink({ status: "idle" }, emailForm(stranger));

    expect(unknown).toEqual({ status: "sent", email: stranger });
    // Identical but for the address the caller typed back at themselves.
    expect({ ...unknown, email: "" }).toEqual({ ...known, email: "" });
    // Both made the same call to Supabase, so the two are alike in work done as well as answer.
    expect(signInWithOtp).toHaveBeenCalledTimes(2);
    // And nothing was written down: a log of unknown addresses is the list a prober wanted.
    expect(logged).not.toHaveBeenCalled();
  });

  it("recognises the refusal from a GoTrue old enough to answer without a code", async () => {
    signInWithOtp.mockResolvedValueOnce({
      error: { status: 422, message: "Signups not allowed for otp" },
    });
    const result = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(result).toEqual({ status: "sent", email: inbox });
    expect(logged).not.toHaveBeenCalled();
  });

  it("stops mailing one address past its budget, and tells the caller nothing about it", async () => {
    fromNewAddress();
    const accepted = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    for (let call = 1; call < SIGN_IN_ADDRESS_LIMIT.attempts; call += 1) {
      fromNewAddress();
      await requestSignInLink({ status: "idle" }, emailForm(inbox));
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_ADDRESS_LIMIT.attempts);

    // A caller from somewhere else entirely: the budget belongs to the recipient, not the asker.
    fromNewAddress();
    const refused = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(refused).toEqual(accepted);
    expect(refused).toEqual({ status: "sent", email: inbox });
    // Refused means refused, though: Supabase was not asked a fourth time.
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_ADDRESS_LIMIT.attempts);
  });

  it("counts one address however it was capitalised or padded", async () => {
    const shouted = ` ${inbox.toUpperCase()} `;
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMIT.attempts; call += 1) {
      fromNewAddress();
      await requestSignInLink({ status: "idle" }, emailForm(call % 2 === 0 ? inbox : shouted));
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_ADDRESS_LIMIT.attempts);

    fromNewAddress();
    expect(await requestSignInLink({ status: "idle" }, emailForm(shouted))).toEqual({
      status: "sent",
      email: inbox,
    });
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_ADDRESS_LIMIT.attempts);
  });

  it("still says an outage out loud, and leaves a line in the log to find it by", async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { status: 500, code: "unexpected_failure" } });
    const result = await requestSignInLink({ status: "idle" }, emailForm(inbox));

    expect(result).toEqual({ status: "error", error: SEND_FAILED });
    expect(logged).toHaveBeenCalledTimes(1);
    // The status and the code say what broke; the address is nobody's business.
    expect(JSON.stringify(logged.mock.calls[0])).toContain("unexpected_failure");
    expect(JSON.stringify(logged.mock.calls[0])).not.toContain(inbox);
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
    const link = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(link).toEqual({ status: "sent", email: inbox });
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
