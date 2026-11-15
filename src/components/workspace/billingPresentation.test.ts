import { describe, expect, it } from "vitest";
import { billingView } from "@/lib/billing/billingCopy";
import { BILLING_FIXTURES, type BillingFixtureName } from "@/lib/billing/billingFixtures";
import { billingActionVariant, billingTone } from "./billingPresentation";

// Each gallery state: the notice's tone, and the one button with how loud it is (#563).
const TABLE: [BillingFixtureName, "status" | "alert", string | null][] = [
  ["free", "status", null],
  ["trial", "status", "portal:secondary"],
  ["trial-cancelled", "status", "portal:secondary"],
  ["active", "status", "portal:secondary"],
  ["ending", "status", "portal:secondary"],
  ["payment-failed", "alert", "portal:primary"],
  ["start-trial", "alert", "trial:primary"],
  ["subscribe", "alert", "subscribe:primary"],
  ["colleague", "status", null],
  ["not-configured", "alert", null],
];

describe("billing presentation", () => {
  it.each(TABLE)("%s: a %s, with %s", (name, tone, button) => {
    const fixture = BILLING_FIXTURES[name];
    const view = billingView(fixture.access, fixture);
    expect(billingTone(fixture.access)).toBe(tone);
    expect(
      view.action ? `${view.action}:${billingActionVariant(fixture.access, view.action)}` : null,
    ).toBe(button);
  });

  it("a failed payment is an alert even for a teacher who cannot fix it", () => {
    const access = { ...BILLING_FIXTURES["payment-failed"].access, canManage: false };
    expect(billingTone(access)).toBe("alert");
  });
});
