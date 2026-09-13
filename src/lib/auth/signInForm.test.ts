import { describe, expect, it } from "vitest";
import { parseSignInForm } from "./signInForm";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("parseSignInForm", () => {
  it("accepts an email, trimmed and lower-cased, and a safe next path", () => {
    expect(
      parseSignInForm(form({ email: "  Nurse.Educator@Example.EDU ", next: "/author/banks/1" })),
    ).toEqual({
      ok: true,
      email: "nurse.educator@example.edu",
      next: "/author/banks/1",
    });
  });

  it("falls back to the author home when next is missing or unsafe", () => {
    expect(parseSignInForm(form({ email: "a@example.test" }))).toMatchObject({ next: "/author" });
    expect(
      parseSignInForm(form({ email: "a@example.test", next: "https://evil.example" })),
    ).toMatchObject({ next: "/author" });
  });

  it.each([[""], ["   "], ["not-an-email"], ["a@"], ["@example.test"]])(
    "rejects %j with a message a person can act on",
    (email) => {
      expect(parseSignInForm(form({ email }))).toEqual({
        ok: false,
        error: "Enter the email address you use for LeaRN, like name@school.edu.",
      });
    },
  );

  it("rejects an email longer than the standard allows", () => {
    const result = parseSignInForm(form({ email: `${"a".repeat(250)}@example.test` }));
    expect(result.ok).toBe(false);
  });

  it("treats a missing email field as empty", () => {
    expect(parseSignInForm(new FormData()).ok).toBe(false);
  });
});
