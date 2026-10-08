import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPTCHA_FAILED, type CaptchaResult } from "@/lib/auth/captcha";
import { ACCOUNT_NAME_EMPTY } from "@/lib/auth/displayName";
import { EMAIL_UNCONFIRMED_KEY } from "@/lib/auth/emailConfirmation";
import { PASSWORD_WEAK } from "@/lib/auth/password";
import { SIGN_UP_LIMITS, SIGN_UP_TRIES_SPENT, SIGN_UP_UNAVAILABLE } from "@/lib/auth/signUpLimit";
import { CAPTCHA_FIELD_NAME, SIGN_UP_CAPTCHA_ACTION } from "@/lib/auth/turnstile";
import type { EmailMessage } from "@/lib/email";
import { WELCOME_SUBJECT } from "@/lib/email/templates/welcome";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";
import type { MemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";

/**
 * The sign-up Server Function is wiring (#361): the form's checks, the sign-up limit and the
 * CAPTCHA in front of any account work, then `signUp`, the welcome email and the redirect. What is
 * pinned here is that order, and that the role reaches the database only through the server's own
 * call to `register_instructor`.
 */

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

const scheduled: (() => Promise<unknown> | void)[] = [];
vi.mock("next/server", () => ({ after: (task: () => Promise<unknown>) => scheduled.push(task) }));

const NEW_USER_ID = "00000000-0000-4000-8000-0000000000a1";
type Created = { data?: { user: { id: string } | null }; error: { code?: string } | null };
const createUser = vi.fn(async (): Promise<Created> => ({
  data: { user: { id: NEW_USER_ID } },
  error: null,
}));
const generateLink = vi.fn(async () => ({
  data: { properties: { hashed_token: "0123456789abcdef" }, user: { id: NEW_USER_ID } },
  error: null,
}));
const profileEq = vi.fn<(column: string, value: string) => Promise<{ error: null }>>(async () => ({
  error: null,
}));
const profileUpdate = vi.fn<(values: Record<string, unknown>) => { eq: typeof profileEq }>(() => ({
  eq: profileEq,
}));
const serviceFrom = vi.fn<(table: string) => { update: typeof profileUpdate }>(() => ({
  update: profileUpdate,
}));
type RpcReply = { data: unknown; error: { code?: string } | null };
const serviceRpc = vi.fn<(name: string, args: Record<string, unknown>) => Promise<RpcReply>>(
  async () => ({ data: "00000000-0000-4000-8000-00000000000f", error: null }),
);
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    rpc: serviceRpc,
    from: serviceFrom,
    auth: { admin: { createUser, generateLink } },
  }),
}));

const signInWithPassword = vi.fn(async () => ({ error: null as { code?: string } | null }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { signInWithPassword } }),
}));

const send = vi.fn<(message: EmailMessage) => Promise<{ id: string }>>(async () => ({
  id: "m-1",
}));
vi.mock("@/lib/email", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email")>()),
  getMailer: () => ({ send }),
}));

// Hoisted: the imports above load the mocked module before this file's own constants exist.
const verifyCaptcha = vi.hoisted(() => vi.fn(async (): Promise<CaptchaResult> => ({ ok: true })));
vi.mock("@/lib/auth/captcha", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/captcha")>()),
  verifyCaptcha,
}));

vi.mock("@/lib/rateLimit/postgresStore", async () => {
  const { createMemoryRateLimitStore } = await import("@/lib/rateLimit/testing/memoryStore");
  const store = createMemoryRateLimitStore();
  return { sharedRateLimitStore: () => store };
});
const rateLimitStore = (
  await import("@/lib/rateLimit/postgresStore")
).sharedRateLimitStore() as MemoryRateLimitStore;

const { createAccount } = await import("./actions");

const IDLE = { status: "idle" } as const;
// A new address for each test: the limiter's counts are shared by the whole file.
let EMAIL = "ada@school.edu";
let made = 0;

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  const all = {
    role: "teacher",
    displayName: "Ada Lovelace",
    email: EMAIL,
    password: "correct horse battery",
    [CAPTCHA_FIELD_NAME]: "a-token",
    ...fields,
  };
  for (const [name, value] of Object.entries(all)) data.set(name, value);
  return data;
}

async function runScheduled(): Promise<void> {
  for (const task of scheduled.splice(0)) await task();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  scheduled.length = 0;
  rateLimitStore.failWith(null);
  made += 1;
  EMAIL = `ada${made}@school.edu`;
});

describe("createAccount: the form's own checks (#361)", () => {
  it.each([
    [{ role: "admin" }, "role", /teach or are a student/],
    [{ displayName: "   " }, "displayName", new RegExp(ACCOUNT_NAME_EMPTY)],
    [{ email: "not-an-address" }, "email", /^Enter the email address you use/],
    [{ password: "short" }, "password", /./],
  ] as const)(
    "refuses %j on the %s field before anything is counted or made",
    async (fields, field, message) => {
      const counted = rateLimitStore.hits().length;
      const state = await createAccount(IDLE, form(fields));
      expect(state).toMatchObject({
        status: "error",
        field,
        error: expect.stringMatching(message),
      });
      expect(verifyCaptcha).not.toHaveBeenCalled();
      expect(createUser).not.toHaveBeenCalled();
      expect(rateLimitStore.hits()).toHaveLength(counted);
    },
  );
});

describe("createAccount: a teacher (#361)", () => {
  it("makes the account, the workspace and the session, then goes to authoring", async () => {
    await expect(createAccount(IDLE, form())).rejects.toThrow("redirect:/author");

    expect(createUser).toHaveBeenCalledWith({
      email: EMAIL,
      password: "correct horse battery",
      email_confirm: true,
      app_metadata: { [EMAIL_UNCONFIRMED_KEY]: true },
    });
    expect(serviceFrom).toHaveBeenCalledWith("profiles");
    expect(profileUpdate).toHaveBeenCalledWith({ display_name: "Ada Lovelace" });
    expect(profileEq).toHaveBeenCalledWith("id", NEW_USER_ID);
    expect(serviceRpc).toHaveBeenCalledWith("register_instructor", {
      p_user: NEW_USER_ID,
      p_workspace: "Ada Lovelace’s workspace",
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: EMAIL,
      password: "correct horse battery",
    });
  });

  it("checks the CAPTCHA for the sign-up action, with the token the form carried", async () => {
    await expect(createAccount(IDLE, form())).rejects.toThrow("redirect:");
    expect(verifyCaptcha).toHaveBeenCalledWith("a-token", requestHeaders, {
      action: SIGN_UP_CAPTCHA_ACTION,
    });
  });

  it("sends the teacher's welcome email after the answer, through the app mailer", async () => {
    await expect(createAccount(IDLE, form())).rejects.toThrow("redirect:/author");
    expect(send).not.toHaveBeenCalled();
    await runScheduled();
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0];
    expect(message.to).toBe(EMAIL);
    expect(message.subject).toBe(WELCOME_SUBJECT);
    expect(message.text).toContain("make a class");
    expect(message.text).toContain("next=%2Fauthor");
  });

  it("leaves a role-less account on the welcome page when the workspace cannot be made", async () => {
    serviceRpc.mockResolvedValueOnce({ data: null, error: { code: "XX000" } });
    await expect(createAccount(IDLE, form())).rejects.toThrow("redirect:/welcome?teach=1");
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("takes the role from the form's role field alone, never from metadata it could carry", async () => {
    const data = form({ role: "student" });
    data.set("user_metadata", JSON.stringify({ role: "instructor" }));
    data.set("app_metadata", JSON.stringify({ role: "instructor" }));
    await expect(createAccount(IDLE, data)).rejects.toThrow("redirect:/welcome");
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(JSON.stringify(createUser.mock.calls)).not.toContain("instructor");
  });
});

describe("createAccount: a student (#361)", () => {
  it("makes an account with no role and goes to the welcome page", async () => {
    await expect(createAccount(IDLE, form({ role: "student" }))).rejects.toThrow(
      "redirect:/welcome",
    );
    expect(redirected).toHaveBeenCalledWith("/welcome");
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(profileUpdate).toHaveBeenCalledWith({ display_name: "Ada Lovelace" });
  });

  it("carries a class code through, and drops one that is not code-shaped", async () => {
    await expect(createAccount(IDLE, form({ role: "student", code: "ABCD2345" }))).rejects.toThrow(
      "redirect:/welcome?code=ABCD2345",
    );
    await expect(
      createAccount(IDLE, form({ role: "student", email: "b@school.edu", code: "//evil.example" })),
    ).rejects.toThrow(/^redirect:\/welcome$/);
  });
});

describe("createAccount: refusals (#361)", () => {
  it("says an address has an account, links nowhere else, and sends no email", async () => {
    createUser.mockResolvedValueOnce({ error: { code: "email_exists" } });
    expect(await createAccount(IDLE, form())).toEqual({ status: "exists", email: EMAIL });
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(serviceRpc).not.toHaveBeenCalled();
    await runScheduled();
    expect(send).not.toHaveBeenCalled();
  });

  it("passes on Supabase's refusal of a weak password", async () => {
    createUser.mockResolvedValueOnce({ error: { code: "weak_password" } });
    expect(await createAccount(IDLE, form())).toEqual({
      status: "error",
      error: PASSWORD_WEAK,
      field: "password",
    });
  });

  it("refuses a failed CAPTCHA before any account is made, and still counts the try", async () => {
    verifyCaptcha.mockResolvedValueOnce({ ok: false, error: CAPTCHA_FAILED });
    const counted = rateLimitStore.hits().length;
    expect(await createAccount(IDLE, form())).toEqual({
      status: "error",
      error: CAPTCHA_FAILED,
      field: "captcha",
    });
    expect(createUser).not.toHaveBeenCalled();
    expect(rateLimitStore.hits().length).toBeGreaterThan(counted);
  });

  it("refuses past the sign-up limit without asking the CAPTCHA or making an account", async () => {
    for (let i = 0; i < SIGN_UP_LIMITS.perPair.attempts; i += 1) {
      createUser.mockResolvedValueOnce({ error: { code: "email_exists" } });
      await createAccount(IDLE, form());
    }
    vi.clearAllMocks();
    expect(await createAccount(IDLE, form())).toEqual({
      status: "error",
      error: SIGN_UP_TRIES_SPENT,
      field: "email",
    });
    expect(verifyCaptcha).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter cannot answer", async () => {
    rateLimitStore.failWith(new RateLimitUnavailableError("down"));
    expect(await createAccount(IDLE, form())).toEqual({
      status: "error",
      error: SIGN_UP_UNAVAILABLE,
      field: "email",
    });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("tells a new account that could not be signed in here where it will land", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { code: "unexpected_failure" } });
    expect(await createAccount(IDLE, form())).toEqual({
      status: "created_signed_out",
      next: "/author",
    });
    expect(redirected).not.toHaveBeenCalled();
  });
});
