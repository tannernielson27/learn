import { describe, expect, it } from "vitest";
import { parseSender, readEmailConfig } from "./config";
import { EmailError } from "./types";

const KEY = "re_test_0123456789abcdef";
const FROM = "LeaRN <learn@info.tannernielson.com>";

function configError(run: () => unknown): EmailError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EmailError);
    expect((error as EmailError).kind).toBe("config");
    return error as EmailError;
  }
  throw new Error("expected a config error");
}

describe("readEmailConfig", () => {
  it("accepts a Resend key and a named sender, trimming both", () => {
    expect(readEmailConfig({ apiKey: `  ${KEY} `, from: ` ${FROM}\n` })).toEqual({
      apiKey: KEY,
      from: FROM,
      sender: { name: "LeaRN", email: "learn@info.tannernielson.com" },
    });
  });

  it("accepts a bare sender address", () => {
    expect(readEmailConfig({ apiKey: KEY, from: "learn@info.tannernielson.com" }).sender).toEqual({
      name: undefined,
      email: "learn@info.tannernielson.com",
    });
  });

  it.each([undefined, "", "   "])("names RESEND_API_KEY when the key is %j", (apiKey) => {
    const error = configError(() => readEmailConfig({ apiKey, from: FROM }));
    expect(error.message).toMatch(/RESEND_API_KEY is not set/);
    expect(error.message).toMatch(/\.env\.example/);
  });

  it("refuses something that is not a Resend key, without echoing it", () => {
    const error = configError(() => readEmailConfig({ apiKey: "sk_live_secret", from: FROM }));
    expect(error.message).toMatch(/RESEND_API_KEY does not look like a Resend API key/);
    expect(error.message).not.toContain("sk_live_secret");
  });

  it.each([undefined, ""])("names EMAIL_FROM when the sender is %j", (from) => {
    const error = configError(() => readEmailConfig({ apiKey: KEY, from }));
    expect(error.message).toMatch(/EMAIL_FROM is not set/);
  });

  it.each(["LeaRN", "LeaRN <not-an-address>", "a@b.co, c@d.co", "LeaRN <a@b.co>\r\nBcc: x@y.co"])(
    "refuses a malformed sender %j",
    (from) => {
      const error = configError(() => readEmailConfig({ apiKey: KEY, from }));
      expect(error.message).toMatch(/EMAIL_FROM must be an address/);
    },
  );

  it("refuses to run when the key was also given a NEXT_PUBLIC_ name", () => {
    const error = configError(() =>
      readEmailConfig({ apiKey: KEY, from: FROM, publicApiKey: KEY }),
    );
    expect(error.message).toMatch(/NEXT_PUBLIC_RESEND_API_KEY/);
    expect(error.message).not.toContain(KEY);
  });
});

describe("parseSender", () => {
  it("splits a display name from the address", () => {
    expect(parseSender("LeaRN Reminders <r@info.tannernielson.com>")).toEqual({
      name: "LeaRN Reminders",
      email: "r@info.tannernielson.com",
    });
  });

  it("returns undefined for a malformed sender", () => {
    expect(parseSender("<>")).toBeUndefined();
  });
});
