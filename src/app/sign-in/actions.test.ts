import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_UNAVAILABLE } from "@/lib/auth/demoAccount";
import { SIGN_IN_EMAIL_ERROR } from "@/lib/auth/signInForm";
import {
  SIGN_IN_ADDRESS_LIMITS,
  SIGN_IN_LIMITS,
  SIGN_IN_RATE_LIMITED,
  SIGN_IN_UNAVAILABLE,
} from "@/lib/auth/signInRateLimit";
import type { MemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";

/**
 * The Server Functions are thin: they read the request, count it against the three limits and
 * hand the rest to src/lib. What is worth pinning here is that wiring — that each path counts
 * against its own limit before it reaches Supabase, and that a normal sign-in is untouched.
 *
 * The other thing pinned here is what #139 turns on: the result the caller sees must not say
 * whether an address has an account. So most of these tests assert not what one path returns but
 * that two paths return the same thing — and the counters are checked through `signInWithOtp`,
 * which is the only place a refusal shows at all.
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

// #234: the limiter counts in Postgres; here it counts in the in-memory fake, shared by every call.
vi.mock("@/lib/rateLimit/postgresStore", async () => {
  const { createMemoryRateLimitStore } = await import("@/lib/rateLimit/testing/memoryStore");
  const store = createMemoryRateLimitStore();
  return { sharedRateLimitStore: () => store };
});
const rateLimitStore = (
  await import("@/lib/rateLimit/postgresStore")
).sharedRateLimitStore() as MemoryRateLimitStore;

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

/** The action logs every Supabase failure and nothing else. Silenced, asserted where it matters. */
const logged = vi.spyOn(console, "error").mockImplementation(() => {});
/** And warns, address-free, when the deployment-wide ceiling refuses. */
const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

let inbox = "";

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitStore.failWith(null);
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
});

/**
 * #139. Each of these compares two paths rather than asserting one, because the property being
 * defended is that the caller cannot tell them apart.
 */
describe("requestSignInLink does not say which addresses have accounts", () => {
  /**
   * Every answer Supabase can give, and one it cannot: the caller must not tell them apart, so
   * the test does not name the cases either — it asserts they all come back the same.
   */
  const supabaseAnswers = [
    ["a link really sent", null],
    ["an address with no account", { status: 422, code: "otp_disabled" }],
    ["the same, from a GoTrue that answers without a code", { status: 422, code: undefined }],
    ["a code nobody has seen before", { status: 422, code: "otp_disabled_v2" }],
    ["Supabase's own per-address limit", { status: 429, code: "over_email_send_rate_limit" }],
    ["an outage", { status: 500, code: "unexpected_failure" }],
  ] as const;

  it.each(supabaseAnswers)("answers %s exactly as every other", async (_name, error) => {
    const to = newRecipient();
    if (error) signInWithOtp.mockResolvedValueOnce({ error: { ...error } });
    const result = await requestSignInLink({ status: "idle" }, emailForm(to));
    expect(result).toEqual({ status: "sent", email: to });
    // Every one of them reached Supabase, so they are alike in work done as well as in answer.
    expect(signInWithOtp).toHaveBeenCalledTimes(1);
  });

  it("holds even if GoTrue renames the no-account code, because nothing reads it", async () => {
    // `AuthError.code` is typed `ErrorCode | (string & {})`, so a rename would compile and a
    // function that recognised the old name would quietly stop recognising it. Nothing here
    // recognises anything, so there is nothing to go stale.
    const known = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    const stranger = newRecipient();
    signInWithOtp.mockResolvedValueOnce({ error: { status: 400, code: "renamed_one_day" } });
    const unknown = await requestSignInLink({ status: "idle" }, emailForm(stranger));
    expect({ ...unknown, email: "" }).toEqual({ ...known, email: "" });
  });

  it("logs every Supabase failure with its status and code, and never the address", async () => {
    signInWithOtp.mockResolvedValueOnce({ error: { status: 500, code: "unexpected_failure" } });
    await requestSignInLink({ status: "idle" }, emailForm(inbox));

    expect(logged).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(logged.mock.calls[0]);
    expect(line).toContain("unexpected_failure");
    expect(line).toContain("500");
    expect(line).not.toContain(inbox);
  });

  it("writes nothing to the log when the link really was sent", async () => {
    await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(logged).not.toHaveBeenCalled();
    expect(warned).not.toHaveBeenCalled();
  });
});

/**
 * The lockout half of #139, found in review. One caller must not be able to stop a named person
 * signing in, and the ceiling that does bound a distributed flood must be visible to an operator
 * without naming who is under it.
 */
describe("requestSignInLink limits the caller and the address separately", () => {
  it("stops one caller past its budget for one address, and says nothing about it", async () => {
    const accepted = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    for (let call = 1; call < SIGN_IN_ADDRESS_LIMITS.perCaller.attempts; call += 1) {
      await requestSignInLink({ status: "idle" }, emailForm(inbox));
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_ADDRESS_LIMITS.perCaller.attempts);

    const refused = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(refused).toEqual(accepted);
    expect(refused).toEqual({ status: "sent", email: inbox });
    // Refused means refused: Supabase was not asked again.
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_ADDRESS_LIMITS.perCaller.attempts);
    // And silently: nothing is logged for the ordinary case of a caller repeating itself.
    expect(warned).not.toHaveBeenCalled();
  });

  it("does not let that caller lock the address's owner out", async () => {
    // The whole reason the budget is keyed on the pair. Spend it many times over from one
    // caller, then ask from somewhere else, the way the owner would.
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.overall.attempts * 3; call += 1) {
      await requestSignInLink({ status: "idle" }, emailForm(inbox));
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_ADDRESS_LIMITS.perCaller.attempts);

    fromNewAddress();
    await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_ADDRESS_LIMITS.perCaller.attempts + 1);
    expect(warned).not.toHaveBeenCalled();
  });

  it("counts one address however it was capitalised or padded", async () => {
    const shouted = ` ${inbox.toUpperCase()} `;
    for (let call = 0; call < SIGN_IN_ADDRESS_LIMITS.perCaller.attempts; call += 1) {
      await requestSignInLink({ status: "idle" }, emailForm(call % 2 === 0 ? inbox : shouted));
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_ADDRESS_LIMITS.perCaller.attempts);

    expect(await requestSignInLink({ status: "idle" }, emailForm(shouted))).toEqual({
      status: "sent",
      email: inbox,
    });
    expect(signInWithOtp).toHaveBeenCalledTimes(SIGN_IN_ADDRESS_LIMITS.perCaller.attempts);
  });

  it("holds the ceiling against a flood spread over callers, and logs it without the address", async () => {
    const { perCaller, overall } = SIGN_IN_ADDRESS_LIMITS;
    for (let call = 0; call < overall.attempts; call += 1) {
      if (call % perCaller.attempts === 0) fromNewAddress();
      expect(await requestSignInLink({ status: "idle" }, emailForm(inbox))).toEqual({
        status: "sent",
        email: inbox,
      });
    }
    expect(signInWithOtp).toHaveBeenCalledTimes(overall.attempts);
    expect(warned).not.toHaveBeenCalled();

    // One more caller: the ceiling holds, and the answer is still a send.
    fromNewAddress();
    expect(await requestSignInLink({ status: "idle" }, emailForm(inbox))).toEqual({
      status: "sent",
      email: inbox,
    });
    expect(signInWithOtp).toHaveBeenCalledTimes(overall.attempts);

    // Visible to an operator as a count, and to nobody as a name.
    expect(warned).toHaveBeenCalledTimes(1);
    const line = JSON.stringify(warned.mock.calls[0]);
    expect(line).toMatch(/ceilingRefusals/);
    expect(line).not.toContain(inbox);
    expect(line).not.toContain(inbox.split("@")[0]);
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

describe("when the shared rate limiter cannot answer (#234)", () => {
  it("refuses the emailed link and never reaches Supabase", async () => {
    rateLimitStore.failWith(new RateLimitUnavailableError("PGRST301"));
    const result = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(result).toEqual({ status: "error", error: SIGN_IN_UNAVAILABLE });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("refuses the demo button and never reaches Supabase", async () => {
    vi.stubEnv("DEMO_ACCOUNT_EMAIL", "demo@learn.test");
    vi.stubEnv("DEMO_ACCOUNT_PASSWORD", "learn-demo");
    rateLimitStore.failWith(new RateLimitUnavailableError("PGRST301"));
    const form = new FormData();
    form.set("next", "/author");
    expect(await signInAsDemo({ status: "idle" }, form)).toEqual({
      status: "error",
      error: SIGN_IN_UNAVAILABLE,
    });
    expect(signInWithPassword).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("does not send once the caller is counted, and answers as if it had", async () => {
    // The per-IP count answers; the store then fails on the address. Not sent, and the answer is
    // the same `sent` every other silent refusal gets.
    const realHit = rateLimitStore.hit.bind(rateLimitStore);
    let calls = 0;
    const hit = vi.spyOn(rateLimitStore, "hit").mockImplementation(async (...args) => {
      calls += 1;
      if (calls > 1) throw new RateLimitUnavailableError("PGRST301");
      return realHit(...args);
    });
    const result = await requestSignInLink({ status: "idle" }, emailForm(inbox));
    expect(result).toEqual({ status: "sent", email: inbox });
    expect(signInWithOtp).not.toHaveBeenCalled();
    hit.mockRestore();
  });
});
