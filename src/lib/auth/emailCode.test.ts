import { describe, expect, it, vi } from "vitest";
import {
  EMAIL_CODE_FAILED,
  EMAIL_CODE_FORMAT,
  parseEmailCodeForm,
  verifyEmailCode,
  type EmailCodeDeps,
} from "./emailCode";
import { SIGN_IN_EMAIL_ERROR } from "./signInForm";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const GOOD = { email: "Nurse@School.edu ", code: "123 456", next: "/learn" };

describe("parseEmailCodeForm (#306)", () => {
  it("reads the address, the code without its spaces or dashes, and the safe next", () => {
    expect(parseEmailCodeForm(form(GOOD))).toEqual({
      ok: true,
      email: "nurse@school.edu",
      code: "123456",
      next: "/learn",
    });
    expect(parseEmailCodeForm(form({ ...GOOD, code: "12-34-56-78" }))).toMatchObject({
      code: "12345678",
    });
  });

  it("never keeps an unsafe next", () => {
    expect(parseEmailCodeForm(form({ ...GOOD, next: "//evil.example" }))).toMatchObject({
      next: "/author",
    });
  });

  it.each(["", "12345", "12345678901", "12a456", "１２３４５６"])(
    "refuses %j as a code, saying what a code looks like",
    (code) => {
      expect(parseEmailCodeForm(form({ ...GOOD, code }))).toEqual({
        ok: false,
        error: EMAIL_CODE_FORMAT,
      });
    },
  );

  it("refuses a missing or malformed address with the sign-in form's own message", () => {
    expect(parseEmailCodeForm(form({ ...GOOD, email: "not-an-address" }))).toEqual({
      ok: false,
      error: SIGN_IN_EMAIL_ERROR,
    });
  });
});

function deps(overrides: Partial<EmailCodeDeps> = {}): EmailCodeDeps {
  return {
    take: vi.fn(async () => ({ ok: true as const })),
    verify: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe("verifyEmailCode (#306)", () => {
  it("counts the try, verifies the code for that address, and answers next", async () => {
    const d = deps();
    expect(await verifyEmailCode(form(GOOD), d)).toEqual({ ok: true, next: "/learn" });
    expect(d.take).toHaveBeenCalledWith("nurse@school.edu");
    expect(d.verify).toHaveBeenCalledWith({
      email: "nurse@school.edu",
      token: "123456",
      type: "email",
    });
  });

  it("answers one generic message for any refusal from Supabase, and logs no address", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      verify: vi.fn(async () => ({ error: { status: 403, code: "otp_expired" } })),
    });
    expect(await verifyEmailCode(form(GOOD), d)).toEqual({ ok: false, error: EMAIL_CODE_FAILED });
    expect(JSON.stringify(error.mock.calls)).not.toContain("school.edu");
    error.mockRestore();
  });

  it("treats a thrown verification like any other refusal", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({
      verify: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    expect(await verifyEmailCode(form(GOOD), d)).toEqual({ ok: false, error: EMAIL_CODE_FAILED });
    error.mockRestore();
  });

  it("stops at the limit without reaching Supabase, with the limiter's own message", async () => {
    const d = deps({ take: vi.fn(async () => ({ ok: false as const, error: "Too many." })) });
    expect(await verifyEmailCode(form(GOOD), d)).toEqual({ ok: false, error: "Too many." });
    expect(d.verify).not.toHaveBeenCalled();
  });

  it("spends nothing on a form that does not read", async () => {
    const d = deps();
    expect(await verifyEmailCode(form({ ...GOOD, code: "12" }), d)).toEqual({
      ok: false,
      error: EMAIL_CODE_FORMAT,
    });
    expect(d.take).not.toHaveBeenCalled();
    expect(d.verify).not.toHaveBeenCalled();
  });
});
