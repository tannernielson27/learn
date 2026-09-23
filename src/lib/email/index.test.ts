import { describe, expect, it, vi } from "vitest";
import { createMailer, getMailer } from "./index";
import { EmailError, type EmailMessage } from "./types";

const MESSAGE: EmailMessage = {
  to: "student@example.com",
  subject: "Due tomorrow",
  text: "Plain",
  html: "<p>HTML</p>",
  idempotencyKey: "k-1",
};

const KEY = "re_test_0123456789abcdef";
const FROM = "LeaRN <learn@info.tannernielson.com>";

function ok(id: string): typeof fetch {
  return vi.fn(
    async () => new Response(JSON.stringify({ id, ID: id }), { status: 200 }),
  ) as typeof fetch;
}

describe("createMailer", () => {
  it("uses Resend when a key is set", async () => {
    const fetchImpl = ok("r-1");
    const mailer = createMailer({ RESEND_API_KEY: KEY, EMAIL_FROM: FROM }, fetchImpl);
    await mailer.send(MESSAGE);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe("https://api.resend.com/emails");
  });

  it("uses the local stack's Mailpit in development when no key is set", async () => {
    const fetchImpl = ok("m-1");
    const mailer = createMailer({ NODE_ENV: "development" }, fetchImpl);
    await mailer.send(MESSAGE);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe("http://127.0.0.1:55324/api/v1/send");
  });

  it("honours SUPABASE_MAILBOX_URL for Mailpit, as the e2e helper does", async () => {
    const fetchImpl = ok("m-1");
    await createMailer(
      { NODE_ENV: "test", SUPABASE_MAILBOX_URL: "http://mailpit:8025" },
      fetchImpl,
    ).send(MESSAGE);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe("http://mailpit:8025/api/v1/send");
  });

  it.each([
    ["a production build", { NODE_ENV: "production" }],
    ["any Vercel deployment", { NODE_ENV: "development", VERCEL: "1" }],
  ])("never falls back to Mailpit on %s: building works, sending fails", async (_n, env) => {
    const fetchImpl = ok("x");
    const mailer = createMailer({ ...env, EMAIL_FROM: FROM }, fetchImpl);
    const error = await mailer.send(MESSAGE).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailError);
    expect((error as EmailError).kind).toBe("config");
    expect((error as EmailError).message).toMatch(/RESEND_API_KEY is not set/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not throw on a bad config until something tries to send", async () => {
    const mailer = createMailer({ RESEND_API_KEY: KEY, EMAIL_FROM: "LeaRN" }, ok("x"));
    const error = await mailer.send(MESSAGE).catch((e: unknown) => e);
    expect((error as EmailError).kind).toBe("config");
  });

  it("getMailer reads the environment without throwing", () => {
    expect(typeof getMailer().send).toBe("function");
  });
});
