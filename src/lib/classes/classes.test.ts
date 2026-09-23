import { describe, expect, it } from "vitest";
import {
  CLASS_NAME_ERROR,
  CLASSES_PATH,
  classPath,
  clipInviteToken,
  invitePath,
  inviteUrl,
  MAX_INVITE_TOKEN_INPUT,
  parseClassForm,
  STUDENT_HOME,
} from "./classes";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("class routes", () => {
  it("puts the student home and the classes page where the app links them", () => {
    expect(STUDENT_HOME).toBe("/learn");
    expect(CLASSES_PATH).toBe("/author/classes");
    expect(classPath("abc")).toBe("/author/classes/abc");
  });

  it("builds the invite link from the site origin and the token", () => {
    const token = "AbC_-0123456789abcdefghijklmnopq";
    expect(invitePath(token)).toBe(`/c/${token}`);
    expect(inviteUrl("https://learn.example", token)).toBe(`https://learn.example/c/${token}`);
  });

  it("escapes anything in a token that is not url-safe, so a path cannot be smuggled in", () => {
    expect(invitePath("../../author")).toBe("/c/..%2F..%2Fauthor");
  });
});

describe("clipInviteToken", () => {
  it("passes a token through unchanged", () => {
    expect(clipInviteToken("AbC_-0123456789abcdefghijklmnopq")).toBe(
      "AbC_-0123456789abcdefghijklmnopq",
    );
  });

  it("clips a long value rather than refusing it, so it still costs a lookup", () => {
    expect(clipInviteToken("x".repeat(5000))).toHaveLength(MAX_INVITE_TOKEN_INPUT);
  });

  it("turns anything that is not a string into an empty token", () => {
    expect(clipInviteToken(null)).toBe("");
    expect(clipInviteToken(undefined)).toBe("");
    expect(clipInviteToken(new File([], "x"))).toBe("");
  });
});

describe("parseClassForm", () => {
  it("trims the name", () => {
    expect(parseClassForm(form({ name: "  NUR 310 — Fall " }))).toEqual({
      ok: true,
      name: "NUR 310 — Fall",
    });
  });

  it.each([[""], ["   "], ["x".repeat(121)]])("refuses %j", (name) => {
    expect(parseClassForm(form({ name }))).toEqual({ ok: false, error: CLASS_NAME_ERROR });
  });

  it("refuses a missing field", () => {
    expect(parseClassForm(new FormData())).toEqual({ ok: false, error: CLASS_NAME_ERROR });
  });

  it("accepts 120 characters", () => {
    expect(parseClassForm(form({ name: "x".repeat(120) })).ok).toBe(true);
  });
});
