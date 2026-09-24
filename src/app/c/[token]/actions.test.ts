import { beforeEach, describe, expect, it, vi } from "vitest";
import { SIGN_IN_EMAIL_ERROR } from "@/lib/auth/signInForm";
import {
  SIGN_IN_ADDRESS_LIMITS,
  SIGN_IN_INVITE_LIMIT,
  SIGN_IN_LIMITS,
  SIGN_IN_RATE_LIMITED,
  SIGN_IN_UNAVAILABLE,
  takeSignInAttempt,
} from "@/lib/auth/signInRateLimit";
import type { MemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";

/**
 * The invite's Server Functions are wiring: the per-IP and per-recipient limits of #139/#157, the
 * per-class budget a valid token earns (#217), the token check, and handing the account work to
 * `after()`. What is pinned here is that wiring, and
 * that no answer says whether an address has an account or which way a token failed.
 */

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const OTHER_TOKEN = "ZyX_-9876543210zyxwvutsrqponmlkj";
const OTHER_CLASS_ID = "00000000-0000-4000-8000-0000000000c2";

const requestHeaders = new Headers({
  "x-vercel-id": "iad1::test",
  "x-vercel-forwarded-for": "203.0.113.1",
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

const scheduled: (() => Promise<void> | void)[] = [];
vi.mock("next/server", () => ({ after: (task: () => Promise<void>) => scheduled.push(task) }));

type Reply = { data: unknown; error: { code?: string } | null };
let resolveReply: Reply;
const rpc = vi.fn(async (name: string) => (name === "resolve_class_invite" ? resolveReply : null));
const createUser = vi.fn(async () => ({ error: null as { code?: string } | null }));
const signInWithOtp = vi.fn(async () => ({ error: null }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({ rpc, auth: { admin: { createUser }, signInWithOtp } }),
}));

let viewer: Record<string, unknown>;
const joinRpc = vi.fn(async () => ({ data: "joined" as unknown, error: null }));
vi.mock("@/lib/classes/viewer", () => ({ readViewer: async () => viewer }));

// #234: the limiter counts in Postgres; here it counts in the in-memory fake, shared by every call.
vi.mock("@/lib/rateLimit/postgresStore", async () => {
  const { createMemoryRateLimitStore } = await import("@/lib/rateLimit/testing/memoryStore");
  const store = createMemoryRateLimitStore();
  return { sharedRateLimitStore: () => store };
});
const rateLimitStore = (
  await import("@/lib/rateLimit/postgresStore")
).sharedRateLimitStore() as MemoryRateLimitStore;

const { requestInviteLink, joinInvitedClass } = await import("./actions");

function emailForm(email: string): FormData {
  const form = new FormData();
  form.set("email", email);
  return form;
}

let caller = 1;
let recipient = 0;
function newRecipient(): string {
  recipient += 1;
  return `student${recipient}@school.edu`;
}

const warned = vi.spyOn(console, "warn").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitStore.failWith(null);
  scheduled.length = 0;
  caller += 1;
  requestHeaders.set("x-vercel-forwarded-for", `203.0.113.${caller}`);
  resolveReply = { data: [{ class_id: CLASS_ID, class_name: "NUR 310" }], error: null };
  viewer = { status: "signed_in", supabase: { rpc: joinRpc }, role: "student" };
});

async function runScheduled(): Promise<void> {
  for (const task of scheduled) await task();
}

describe("requestInviteLink", () => {
  it("checks the token with the caller's address, then sends after the response", async () => {
    const email = newRecipient();
    expect(await requestInviteLink(TOKEN, { status: "idle" }, emailForm(email))).toEqual({
      status: "sent",
      email,
    });
    expect(rpc).toHaveBeenCalledWith("resolve_class_invite", {
      token: TOKEN,
      client_key: `203.0.113.${caller}`,
    });
    // Nothing touched an account before the answer went back.
    expect(createUser).not.toHaveBeenCalled();
    await runScheduled();
    expect(createUser).toHaveBeenCalledWith({
      email,
      email_confirm: true,
      app_metadata: { learn_invite: { class_id: CLASS_ID } },
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email,
      options: {
        emailRedirectTo: "https://learn.example/auth/confirm?next=%2Flearn",
        shouldCreateUser: false,
      },
    });
  });

  it("answers an address that already has an account exactly as a new one", async () => {
    createUser.mockResolvedValueOnce({ error: { code: "email_exists" } });
    const email = newRecipient();
    const answer = await requestInviteLink(TOKEN, { status: "idle" }, emailForm(email));
    expect(answer).toEqual({ status: "sent", email });
    await runScheduled();
    expect(signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: `https://learn.example/auth/confirm?next=%2Fc%2F${TOKEN}`,
        }),
      }),
    );
  });

  it("gives an unknown, rotated and malformed token one answer, each after asking the database", async () => {
    resolveReply = { data: [], error: null };
    const unknown = await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()));
    const malformed = await requestInviteLink(
      "../../etc",
      { status: "idle" },
      emailForm(newRecipient()),
    );
    expect(unknown).toEqual({ status: "invalid" });
    expect(malformed).toEqual(unknown);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(scheduled).toHaveLength(0);
  });

  it("refuses a bad address before anything is counted or looked up", async () => {
    expect(await requestInviteLink(TOKEN, { status: "idle" }, emailForm("nope"))).toEqual({
      status: "error",
      error: SIGN_IN_EMAIL_ERROR,
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("lets sixty students behind one campus address each get a link through a valid invite (#217)", async () => {
    for (let student = 0; student < 60; student += 1) {
      const email = newRecipient();
      expect(await requestInviteLink(TOKEN, { status: "idle" }, emailForm(email))).toEqual({
        status: "sent",
        email,
      });
    }
    expect(scheduled).toHaveLength(60);
  });

  it("refuses a valid invite past its per-class ceiling, with the sign-in wording", async () => {
    for (let i = 0; i < SIGN_IN_INVITE_LIMIT.attempts; i += 1) {
      await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()));
    }
    scheduled.length = 0;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const recipient = newRecipient();
    const over = await requestInviteLink(TOKEN, { status: "idle" }, emailForm(recipient));
    expect(over).toEqual({ status: "error", error: SIGN_IN_RATE_LIMITED });
    expect(scheduled).toHaveLength(0);
    // Said out loud, with the class to rotate, and never the address.
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("classId");
    expect(logged).not.toContain(recipient);
    warn.mockRestore();
  });

  it("gives another class from the same address a ceiling of its own", async () => {
    for (let i = 0; i <= SIGN_IN_INVITE_LIMIT.attempts; i += 1) {
      await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()));
    }
    resolveReply = { data: [{ class_id: OTHER_CLASS_ID, class_name: "NUR 320" }], error: null };
    const email = newRecipient();
    expect(await requestInviteLink(OTHER_TOKEN, { status: "idle" }, emailForm(email))).toEqual({
      status: "sent",
      email,
    });
  });

  it.each([
    ["an unknown or rotated token", TOKEN, { data: [], error: null }],
    ["a malformed token", "../../etc", { data: [], error: null }],
    [
      "an address that has guessed too many tokens",
      TOKEN,
      { data: null, error: { code: "PT429" } },
    ],
    ["a database that cannot answer", TOKEN, { data: null, error: { code: "XX000" } }],
  ] as const)("limits %s to the per-IP budget exactly as before", async (_label, token, reply) => {
    resolveReply = reply;
    const first = await requestInviteLink(token, { status: "idle" }, emailForm(newRecipient()));
    for (let i = 1; i < SIGN_IN_LIMITS.email.attempts; i += 1) {
      expect(await requestInviteLink(token, { status: "idle" }, emailForm(newRecipient()))).toEqual(
        first,
      );
    }
    expect(first.status).not.toBe("sent");
    const over = await requestInviteLink(token, { status: "idle" }, emailForm(newRecipient()));
    expect(over).toEqual({ status: "error", error: SIGN_IN_RATE_LIMITED });
    expect(scheduled).toHaveLength(0);
  });

  it("does not let a burst of valid invites spend plain sign-in's per-IP budget", async () => {
    for (let student = 0; student < 60; student += 1) {
      await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()));
    }
    for (let i = 0; i < SIGN_IN_LIMITS.email.attempts; i += 1) {
      expect(await takeSignInAttempt(requestHeaders, "email")).toEqual({ ok: true });
    }
    expect((await takeSignInAttempt(requestHeaders, "email")).ok).toBe(false);
  });

  it("gives no larger budget once the token stops resolving", async () => {
    // A student shares the link, the instructor rotates it: the holder falls back to per-IP.
    for (let i = 0; i < 40; i += 1) {
      await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()));
    }
    resolveReply = { data: [], error: null };
    for (let i = 0; i < SIGN_IN_LIMITS.email.attempts; i += 1) {
      expect(await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()))).toEqual(
        { status: "invalid" },
      );
    }
    expect(await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()))).toEqual({
      status: "error",
      error: SIGN_IN_RATE_LIMITED,
    });
  });

  it("lets a class through even after someone on its network spent the per-IP budget on bad tokens", async () => {
    resolveReply = { data: [], error: null };
    for (let i = 0; i <= SIGN_IN_LIMITS.email.attempts; i += 1) {
      await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()));
    }
    resolveReply = { data: [{ class_id: CLASS_ID, class_name: "NUR 310" }], error: null };
    const email = newRecipient();
    expect(await requestInviteLink(TOKEN, { status: "idle" }, emailForm(email))).toEqual({
      status: "sent",
      email,
    });
  });

  it("stops mailing one address after its per-caller budget, silently", async () => {
    const email = newRecipient();
    for (let i = 0; i < SIGN_IN_ADDRESS_LIMITS.perCaller.attempts; i += 1) {
      await requestInviteLink(TOKEN, { status: "idle" }, emailForm(email));
    }
    scheduled.length = 0;
    expect(await requestInviteLink(TOKEN, { status: "idle" }, emailForm(email))).toEqual({
      status: "sent",
      email,
    });
    expect(scheduled).toHaveLength(0);
  });

  it("says so when the address has guessed too many tokens", async () => {
    resolveReply = { data: null, error: { code: "PT429" } };
    const answer = await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()));
    expect(answer.status).toBe("error");
  });
});

describe("joinInvitedClass", () => {
  it("joins a signed-in account and sends it to the student home", async () => {
    await expect(joinInvitedClass(TOKEN)).rejects.toThrow("redirect:/learn");
    expect(joinRpc).toHaveBeenCalledWith("join_class", { token: TOKEN });
  });

  it("tells an instructor they already are one, and changes nothing", async () => {
    joinRpc.mockResolvedValueOnce({ data: "instructor", error: null });
    expect(await joinInvitedClass(TOKEN)).toEqual({ status: "instructor" });
  });

  it("answers a token that stopped working as invalid", async () => {
    joinRpc.mockResolvedValueOnce({ data: "invalid", error: null });
    expect(await joinInvitedClass(TOKEN)).toEqual({ status: "invalid" });
  });

  it("sends a visitor who is not signed in back to the invite", async () => {
    viewer = { status: "signed_out" };
    await expect(joinInvitedClass(TOKEN)).rejects.toThrow(`redirect:/c/${TOKEN}`);
    expect(joinRpc).not.toHaveBeenCalled();
  });
});

describe("requestInviteLink when the shared rate limiter cannot answer (#234)", () => {
  it("refuses a valid token's request, creates no account and sends nothing", async () => {
    rateLimitStore.failWith(new RateLimitUnavailableError("PGRST301"));
    const result = await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()));
    expect(result).toEqual({ status: "error", error: SIGN_IN_UNAVAILABLE });
    expect(scheduled).toHaveLength(0);
    expect(createUser).not.toHaveBeenCalled();
    // Not a rate limit, so not logged as a link used too hard: the log keys on the refusal's wording.
    expect(warned).not.toHaveBeenCalled();
  });

  it("refuses an unknown token's request the same way, before saying the token is wrong", async () => {
    resolveReply = { data: [], error: null };
    rateLimitStore.failWith(new RateLimitUnavailableError("PGRST301"));
    const result = await requestInviteLink(TOKEN, { status: "idle" }, emailForm(newRecipient()));
    expect(result).toEqual({ status: "error", error: SIGN_IN_UNAVAILABLE });
  });
});
