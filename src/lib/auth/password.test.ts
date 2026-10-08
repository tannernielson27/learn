import { describe, expect, it, vi } from "vitest";
import {
  checkNewPassword,
  parsePasswordSignInForm,
  PASSWORD_MISSING,
  PASSWORD_NOT_SAVED,
  PASSWORD_REAUTHENTICATE,
  PASSWORD_SIGN_IN_FAILED,
  PASSWORD_TOO_LONG,
  PASSWORD_TOO_SHORT,
  PASSWORD_WEAK,
  saveNewPassword,
  signInWithPassword,
  type PasswordSignInDeps,
  type SavePasswordDeps,
} from "./password";
import { SIGN_IN_EMAIL_ERROR } from "./signInForm";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const GOOD = { email: "Nurse@School.edu ", password: " correct horse ", next: "/learn" };

describe("checkNewPassword", () => {
  it("accepts eight characters or more, exactly as typed", () => {
    expect(checkNewPassword(" 1234567")).toEqual({ ok: true, password: " 1234567" });
    expect(checkNewPassword("a long phrase is a good password")).toMatchObject({ ok: true });
  });

  it("counts characters as a person does", () => {
    expect(checkNewPassword("éééééééé")).toMatchObject({ ok: true });
  });

  it.each(["", "1234567", null])("refuses %j as too short", (value) => {
    expect(checkNewPassword(value)).toEqual({ ok: false, error: PASSWORD_TOO_SHORT });
  });

  it("refuses more than bcrypt reads, counted in bytes", () => {
    expect(checkNewPassword("a".repeat(72))).toMatchObject({ ok: true });
    expect(checkNewPassword("a".repeat(73))).toEqual({ ok: false, error: PASSWORD_TOO_LONG });
    expect(checkNewPassword("é".repeat(37))).toEqual({ ok: false, error: PASSWORD_TOO_LONG });
  });
});

describe("parsePasswordSignInForm", () => {
  it("reads the address, the password untrimmed, and the safe next", () => {
    expect(parsePasswordSignInForm(form(GOOD))).toEqual({
      ok: true,
      email: "nurse@school.edu",
      password: " correct horse ",
      next: "/learn",
    });
  });

  it("never keeps an unsafe next", () => {
    expect(parsePasswordSignInForm(form({ ...GOOD, next: "//evil.example" }))).toMatchObject({
      next: "/author",
    });
  });

  it("refuses a malformed address with the sign-in form's own message", () => {
    expect(parsePasswordSignInForm(form({ ...GOOD, email: "nope" }))).toEqual({
      ok: false,
      error: SIGN_IN_EMAIL_ERROR,
    });
  });

  it("asks for a missing password, and answers an impossible one like a wrong one", () => {
    expect(parsePasswordSignInForm(form({ ...GOOD, password: "" }))).toEqual({
      ok: false,
      error: PASSWORD_MISSING,
    });
    expect(parsePasswordSignInForm(form({ ...GOOD, password: "a".repeat(73) }))).toEqual({
      ok: false,
      error: PASSWORD_SIGN_IN_FAILED,
    });
  });
});

function signInDeps(overrides: Partial<PasswordSignInDeps> = {}): PasswordSignInDeps {
  return {
    take: vi.fn(async () => ({ ok: true as const })),
    signIn: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe("signInWithPassword", () => {
  it("counts the try, signs in with that address and password, and answers next", async () => {
    const d = signInDeps();
    expect(await signInWithPassword(form(GOOD), d)).toEqual({ ok: true, next: "/learn" });
    expect(d.take).toHaveBeenCalledWith("nurse@school.edu");
    expect(d.signIn).toHaveBeenCalledWith({
      email: "nurse@school.edu",
      password: " correct horse ",
    });
  });

  it("answers a wrong password with the one message, and does not log it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = signInDeps({
      signIn: vi.fn(async () => ({ error: { status: 400, code: "invalid_credentials" } })),
    });
    expect(await signInWithPassword(form(GOOD), d)).toEqual({
      ok: false,
      error: PASSWORD_SIGN_IN_FAILED,
    });
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("answers any other refusal the same way, and logs no address or password", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = signInDeps({
      signIn: vi.fn(async () => ({ error: { status: 500, code: "unexpected_failure" } })),
    });
    expect(await signInWithPassword(form(GOOD), d)).toEqual({
      ok: false,
      error: PASSWORD_SIGN_IN_FAILED,
    });
    expect(error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).not.toContain("school.edu");
    expect(logged).not.toContain("correct horse");
    error.mockRestore();
  });

  it("treats a thrown sign-in like any other refusal", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = signInDeps({
      signIn: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    expect(await signInWithPassword(form(GOOD), d)).toEqual({
      ok: false,
      error: PASSWORD_SIGN_IN_FAILED,
    });
    error.mockRestore();
  });

  it("stops at the limit without reaching Supabase, with the limiter's own message", async () => {
    const d = signInDeps({ take: vi.fn(async () => ({ ok: false as const, error: "Too many." })) });
    expect(await signInWithPassword(form(GOOD), d)).toEqual({ ok: false, error: "Too many." });
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it("spends nothing on a form that does not read", async () => {
    const d = signInDeps();
    await signInWithPassword(form({ ...GOOD, password: "" }), d);
    expect(d.take).not.toHaveBeenCalled();
    expect(d.signIn).not.toHaveBeenCalled();
  });
});

function saveDeps(overrides: Partial<SavePasswordDeps> = {}): SavePasswordDeps {
  return {
    update: vi.fn(async () => ({ error: null })),
    signOutOthers: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe("saveNewPassword", () => {
  it("saves the password, then signs out every other session", async () => {
    const d = saveDeps();
    expect(await saveNewPassword("correct horse", d)).toEqual({ ok: true });
    expect(d.update).toHaveBeenCalledWith({ password: "correct horse" });
    expect(d.signOutOthers).toHaveBeenCalledTimes(1);
  });

  it("refuses a short password before asking Supabase", async () => {
    const d = saveDeps();
    expect(await saveNewPassword("short", d)).toEqual({ ok: false, error: PASSWORD_TOO_SHORT });
    expect(d.update).not.toHaveBeenCalled();
  });

  it("treats the password the account already has as saved", async () => {
    const d = saveDeps({
      update: vi.fn(async () => ({ error: { status: 422, code: "same_password" } })),
    });
    expect(await saveNewPassword("correct horse", d)).toEqual({ ok: true });
    expect(d.signOutOthers).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["weak_password", PASSWORD_WEAK],
    ["reauthentication_needed", PASSWORD_REAUTHENTICATE],
  ])("explains %s, and leaves the other sessions alone", async (code, message) => {
    const d = saveDeps({ update: vi.fn(async () => ({ error: { status: 422, code } })) });
    expect(await saveNewPassword("correct horse", d)).toEqual({ ok: false, error: message });
    expect(d.signOutOthers).not.toHaveBeenCalled();
  });

  it("answers any other failure generically, and logs no password", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = saveDeps({
      update: vi.fn(async () => ({ error: { status: 500, code: "unexpected_failure" } })),
    });
    expect(await saveNewPassword("correct horse", failing)).toEqual({
      ok: false,
      error: PASSWORD_NOT_SAVED,
    });
    const throwing = saveDeps({
      update: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    expect(await saveNewPassword("correct horse", throwing)).toEqual({
      ok: false,
      error: PASSWORD_NOT_SAVED,
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("correct horse");
    error.mockRestore();
  });

  it("still counts the password as saved when the other sessions could not be signed out", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = saveDeps({ signOutOthers: vi.fn(async () => ({ error: { status: 500 } })) });
    expect(await saveNewPassword("correct horse", d)).toEqual({ ok: true });
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });
});
