import { describe, expect, it } from "vitest";
import { landingEntry } from "./landing";

describe("landingEntry (#264)", () => {
  it("offers Sign in to a visitor", () => {
    expect(landingEntry({ status: "signed_out" })).toEqual({
      href: "/sign-in",
      label: "Sign in",
    });
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
