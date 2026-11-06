import { describe, expect, it } from "vitest";
import { billingEnforced, readOnlyFor } from "./enforcement";

describe("billingEnforced (#521)", () => {
  it("is on only for the exact string true", () => {
    expect(billingEnforced({ BILLING_ENFORCED: "true" })).toBe(true);
  });

  it.each([undefined, "", "TRUE", "True", "1", "yes", "on", " true", "true ", "false"])(
    "is off for %j, so a typo never locks a workspace out",
    (value) => {
      expect(billingEnforced({ BILLING_ENFORCED: value })).toBe(false);
    },
  );

  it("is off with nothing set at all, as it ships", () => {
    expect(billingEnforced({})).toBe(false);
  });
});

describe("readOnlyFor (#521)", () => {
  const lapsed = { hasAccess: false, canManage: true };

  it("is never read-only while billing is not enforced", () => {
    expect(readOnlyFor(false, lapsed)).toBeNull();
  });

  it("is read-only when enforced and the workspace has no access, saying who can subscribe", () => {
    expect(readOnlyFor(true, lapsed)).toEqual({ readOnly: true, canManage: true });
    expect(readOnlyFor(true, { hasAccess: false, canManage: false })).toEqual({
      readOnly: true,
      canManage: false,
    });
  });

  it("is not read-only when enforced and the workspace has access", () => {
    expect(readOnlyFor(true, { hasAccess: true, canManage: false })).toBeNull();
  });

  it("leaves the decision to the database when the access read failed", () => {
    expect(readOnlyFor(true, null)).toBeNull();
  });
});
