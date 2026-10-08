import { describe, expect, it } from "vitest";
import { landingEntry } from "./landing";

describe("landingEntry (#264)", () => {
  it("offers a visitor an account first, and Sign in beside it (#366)", () => {
    expect(landingEntry({ status: "signed_out" })).toEqual({
      href: "/sign-up",
      label: "Create an account",
      also: { href: "/sign-in", label: "Sign in" },
    });
  });

  it("offers someone already signed in no second way in", () => {
    for (const role of ["instructor", "admin", "student", null] as const) {
      expect(landingEntry({ status: "signed_in", role }).also).toBeUndefined();
    }
  });

  it("sends an instructor or an admin to authoring", () => {
    const home = { href: "/author", label: "Go to your item banks" };
    expect(landingEntry({ status: "signed_in", role: "instructor" })).toEqual(home);
    expect(landingEntry({ status: "signed_in", role: "admin" })).toEqual(home);
  });

  it("sends a student to the student home", () => {
    expect(landingEntry({ status: "signed_in", role: "student" })).toEqual({
      href: "/learn",
      label: "Go to your classes",
    });
  });

  it("sends an account with no role to the welcome page (#362)", () => {
    expect(landingEntry({ status: "signed_in", role: null })).toEqual({
      href: "/welcome",
      label: "Get started",
    });
  });
});

describe("signedInHome (#361)", () => {
  it("sends each role to its own home, and an account with no role to the welcome page", async () => {
    const { signedInHome } = await import("./landing");
    expect(signedInHome("instructor")).toBe("/author");
    expect(signedInHome("admin")).toBe("/author");
    expect(signedInHome("student")).toBe("/learn");
    expect(signedInHome(null)).toBe("/welcome");
  });
});

describe("afterSignInPath (#363)", () => {
  it("sends each role to its own home when nowhere was asked for", async () => {
    const { afterSignInPath } = await import("./landing");
    expect(afterSignInPath("/author", "instructor")).toBe("/author");
    expect(afterSignInPath("/author", "admin")).toBe("/author");
    expect(afterSignInPath("/author", "student")).toBe("/learn");
    expect(afterSignInPath("/author", null)).toBe("/welcome");
  });

  it("lets a next that was asked for win, whatever the role", async () => {
    const { afterSignInPath } = await import("./landing");
    for (const role of ["instructor", "admin", "student", null] as const) {
      expect(afterSignInPath("/account/password?next=%2Flearn", role)).toBe(
        "/account/password?next=%2Flearn",
      );
      expect(afterSignInPath("/author/banks/1", role)).toBe("/author/banks/1");
      expect(afterSignInPath("/learn", role)).toBe("/learn");
    }
  });

  it("is only ever given a path safeNextPath has passed, so an unsafe next is already authoring", async () => {
    const { afterSignInPath } = await import("./landing");
    const { safeNextPath } = await import("./nextPath");
    expect(afterSignInPath(safeNextPath("https://evil.example"), "student")).toBe("/learn");
    expect(afterSignInPath(safeNextPath("//evil.example"), null)).toBe("/welcome");
  });
});
