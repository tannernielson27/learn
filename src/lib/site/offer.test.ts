import { describe, expect, it } from "vitest";
import { landingEntry } from "@/lib/auth/landing";
import { START_TRIAL, trialEntry } from "./offer";

describe("trialEntry (#563)", () => {
  it("names a visitor's sign-up link for the free trial, with Sign in kept beside it", () => {
    expect(trialEntry(landingEntry({ status: "signed_out" }))).toEqual({
      href: "/sign-up",
      label: START_TRIAL,
      also: { href: "/sign-in", label: "Sign in" },
    });
    expect(START_TRIAL).toBe("Start your free trial");
  });

  it("leaves a signed-in visitor's own home and its label alone", () => {
    for (const role of ["instructor", "admin", "student", null] as const) {
      const entry = landingEntry({ status: "signed_in", role });
      expect(trialEntry(entry)).toEqual(entry);
    }
  });
});
