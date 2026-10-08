import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailError, type EmailMessage, type Mailer } from "@/lib/email";
import { WELCOME_SUBJECT } from "@/lib/email/templates/welcome";
import { safeNextPath } from "./nextPath";
import { sendWelcomeEmail, welcomeLink, type WelcomeEmailDeps } from "./welcomeEmail";

const USER = { email: "nurse@school.edu" };
const USER_ID = "00000000-0000-4000-8000-0000000003a0";
const TOKEN_HASH = "4f3c2b1a0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e1d0c9b8a7f";

// A request whose Host a caller forged, arriving at production, where SITE_URL is the truth.
const FORGED = new Headers({ host: "evil.example", "x-forwarded-proto": "https" });
const PRODUCTION = { VERCEL_ENV: "production", SITE_URL: "https://learn.example" };

function mailer(send: Mailer["send"] = async () => ({ id: "m-1" })): Mailer & {
  send: ReturnType<typeof vi.fn>;
} {
  return { send: vi.fn(send) };
}

function deps(overrides: Partial<WelcomeEmailDeps> = {}): WelcomeEmailDeps {
  let n = 0;
  return {
    requestHeaders: FORGED,
    env: PRODUCTION,
    generateLink: vi.fn(async () => ({
      data: {
        properties: { hashed_token: TOKEN_HASH, email_otp: "123456" },
        user: { id: USER_ID },
      },
      error: null,
    })),
    mailer: mailer(),
    allow: vi.fn(async () => true),
    nonce: () => `n${(n += 1)}`,
    ...overrides,
  };
}

function sentMessage(d: WelcomeEmailDeps): EmailMessage {
  return vi.mocked(d.mailer.send).mock.calls[0]![0];
}

function linkIn(message: EmailMessage): URL {
  const found = message.text.match(/https?:\/\/\S+\/auth\/confirm\?\S+/)?.[0];
  expect(found).toBeTruthy();
  return new URL(found!);
}

const logged = vi.spyOn(console, "error").mockImplementation(() => {});
beforeEach(() => logged.mockClear());

describe("welcomeLink", () => {
  it.each([
    ["student", "/learn"],
    ["teacher", "/author"],
    ["newcomer", "/welcome"],
  ] as const)("sends a %s to %s through /auth/confirm", (role, home) => {
    const link = new URL(welcomeLink("https://learn.example", role, TOKEN_HASH));
    expect(link.origin).toBe("https://learn.example");
    expect(link.pathname).toBe("/auth/confirm");
    expect(link.searchParams.get("next")).toBe(home);
    expect(safeNextPath(link.searchParams.get("next"))).toBe(home);
    expect(link.searchParams.get("token_hash")).toBe(TOKEN_HASH);
    expect(link.searchParams.get("type")).toBe("email");
  });
});

describe("sendWelcomeEmail", () => {
  it("makes the link with the admin API and mails the welcome email through the app mailer", async () => {
    const d = deps();
    expect(await sendWelcomeEmail(USER, "student", d)).toBe(true);
    expect(d.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: USER.email });
    const message = sentMessage(d);
    expect(message.to).toBe(USER.email);
    expect(message.subject).toBe(WELCOME_SUBJECT);
    expect(message.html).toContain("Confirm my email address");
    expect(message.text).toContain("you are in your class");
  });

  it("puts the link on the canonical origin, never the one the request names", async () => {
    const d = deps();
    await sendWelcomeEmail(USER, "student", d);
    const link = linkIn(sentMessage(d));
    expect(link.origin).toBe("https://learn.example");
    expect(sentMessage(d).html).not.toContain("evil.example");
    expect(sentMessage(d).text).not.toContain("evil.example");
  });

  it.each([
    ["student", "/learn"],
    ["teacher", "/author"],
    ["newcomer", "/welcome"],
  ] as const)("gives the %s link a next that passes safeNextPath unchanged", async (role, home) => {
    const d = deps();
    await sendWelcomeEmail(USER, role, d);
    const next = linkIn(sentMessage(d)).searchParams.get("next");
    expect(next).toBe(home);
    expect(safeNextPath(next)).toBe(next);
  });

  it("never mails the code that came with the link", async () => {
    const d = deps();
    await sendWelcomeEmail(USER, "student", d);
    expect(JSON.stringify(sentMessage(d))).not.toContain("123456");
  });

  it("keys each send on the account and a fresh nonce, so a resend is not dropped as a repeat", async () => {
    const d = deps();
    await sendWelcomeEmail(USER, "student", d);
    await sendWelcomeEmail(USER, "student", d);
    const keys = vi.mocked(d.mailer.send).mock.calls.map(([message]) => message.idempotencyKey);
    expect(keys).toEqual([`welcome:${USER_ID}:n1`, `welcome:${USER_ID}:n2`]);
    // Never the address, which would reach the provider as a header.
    expect(keys.join()).not.toContain("school.edu");
  });

  it("uses a random nonce when none is injected", async () => {
    const d = deps({ nonce: undefined });
    await sendWelcomeEmail(USER, "teacher", d);
    expect(sentMessage(d).idempotencyKey).toMatch(new RegExp(`^welcome:${USER_ID}:[0-9a-f-]{36}$`));
  });

  it("never throws: a mailer error is logged and answered false", async () => {
    const d = deps({
      mailer: mailer(async () => {
        throw new EmailError("config", "RESEND_API_KEY is not set.");
      }),
    });
    await expect(sendWelcomeEmail(USER, "student", d)).resolves.toBe(false);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logged.mock.calls)).toContain("config");
  });

  it("sends nothing when the admin API refuses, throws, or answers without a token", async () => {
    const refused = deps({
      generateLink: vi.fn(async () => ({ data: null, error: { status: 500, code: "x" } })),
    });
    const throwing = deps({
      generateLink: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    const empty = deps({
      generateLink: vi.fn(async () => ({ data: { properties: null, user: null }, error: null })),
    });
    for (const d of [refused, throwing, empty]) {
      await expect(sendWelcomeEmail(USER, "student", d)).resolves.toBe(false);
      expect(d.mailer.send).not.toHaveBeenCalled();
    }
    expect(logged).toHaveBeenCalledTimes(3);
  });

  it("makes no token and sends nothing once the deployment's ceiling refuses", async () => {
    const d = deps({ allow: vi.fn(async () => false) });
    await expect(sendWelcomeEmail(USER, "student", d)).resolves.toBe(false);
    expect(d.generateLink).not.toHaveBeenCalled();
    expect(d.mailer.send).not.toHaveBeenCalled();
  });

  it("logs no address and no token, whatever fails", async () => {
    const failing = deps({
      mailer: mailer(async () => {
        throw new Error(`could not send to ${USER.email} with ${TOKEN_HASH}`);
      }),
    });
    await sendWelcomeEmail(USER, "student", failing);
    const text = JSON.stringify(logged.mock.calls);
    expect(text).not.toContain("school.edu");
    expect(text).not.toContain(TOKEN_HASH);
  });
});
