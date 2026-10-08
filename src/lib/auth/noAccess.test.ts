import { describe, expect, it } from "vitest";
import { NO_ACCESS_PATH, noAccessRedirect } from "./noAccess";

describe("noAccessRedirect", () => {
  it("sends an account with no role to the welcome page, where it has a way forward (#362)", () => {
    expect(noAccessRedirect("forbidden")).toBe("/welcome");
    expect(noAccessRedirect("forbidden", null)).toBe("/welcome");
  });

  it("sends a student to the student home (#205)", () => {
    expect(noAccessRedirect("forbidden", "student")).toBe("/learn");
  });

  it("sends an author home, since the page is not about them", () => {
    expect(noAccessRedirect("ok")).toBe("/author");
  });

  it("sends a signed-out visitor to sign in, back to authoring after", () => {
    expect(noAccessRedirect("signed_out")).toBe("/sign-in?next=%2Fauthor");
  });

  it("keeps the old address, for anyone who saved it", () => {
    expect(NO_ACCESS_PATH).toBe("/author/no-access");
  });
});
