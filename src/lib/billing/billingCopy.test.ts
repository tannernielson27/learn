import { describe, expect, it } from "vitest";
import type { WorkspaceAccess } from "./access";
import {
  BILLING_ASK_FOUNDER,
  BILLING_REFUSAL_MESSAGES,
  billingConfirmation,
  billingView,
  formatBillingDate,
} from "./billingCopy";
import { BILLING_FIXTURES, BILLING_FIXTURE_NAMES, parseBillingFixture } from "./billingFixtures";

const ON = { configured: true, trialAvailable: true };

function as(access: WorkspaceAccess, canManage: boolean): WorkspaceAccess {
  return { ...access, canManage };
}

describe("formatBillingDate", () => {
  it("reads day, month and year in UTC", () => {
    expect(formatBillingDate("2026-11-03T15:00:00Z")).toBe("3 November 2026");
    expect(formatBillingDate("2026-11-03T23:30:00-05:00")).toBe("4 November 2026");
  });

  it("is null for nothing or for something that is not a date", () => {
    expect(formatBillingDate(null)).toBeNull();
    expect(formatBillingDate("soon")).toBeNull();
  });
});

describe("billingView", () => {
  it("free access: no price, no button and nothing about where it came from", () => {
    for (const grant of ["exempt", "grandfathered", "beta"] as const) {
      for (const canManage of [true, false]) {
        const view = billingView(
          { hasAccess: true, canManage, state: { kind: "free", grant } },
          ON,
        );
        expect(view).toEqual({
          lines: ["This workspace has free access. There is nothing to pay."],
          action: null,
        });
        expect(view.lines.join(" ")).not.toMatch(/beta|grandfather|pass|\$/i);
      }
    }
  });

  it("a trial says when it ends and what follows", () => {
    expect(billingView(BILLING_FIXTURES.trial.access, ON)).toEqual({
      lines: [
        "Your free trial ends on 3 November 2026.",
        "Then your subscription starts, at $39.99 a month.",
      ],
      action: "portal",
    });
    expect(billingView(BILLING_FIXTURES["trial-cancelled"].access, ON).lines[1]).toBe(
      "Your subscription will not start when it ends.",
    );
  });

  it("a subscription renews on a date, or ends on it once cancelled", () => {
    expect(billingView(BILLING_FIXTURES.active.access, ON)).toEqual({
      lines: [
        "Your subscription renews on 3 December 2026.",
        "$39.99 a month, for up to 10 teachers.",
      ],
      action: "portal",
    });
    expect(billingView(BILLING_FIXTURES.ending.access, ON).lines[0]).toBe(
      "Your subscription ends on 3 December 2026.",
    );
  });

  it("words a missing date without inventing one", () => {
    expect(
      billingView(
        {
          hasAccess: true,
          canManage: true,
          state: { kind: "trial", endsAt: null, convertsToPaid: true },
        },
        ON,
      ).lines[0],
    ).toBe("Your free trial has started.");
    expect(
      billingView(
        {
          hasAccess: true,
          canManage: true,
          state: { kind: "active", periodEndsAt: null, renews: true },
        },
        ON,
      ).lines[0],
    ).toBe("Your subscription is active.");
    expect(
      billingView(
        {
          hasAccess: true,
          canManage: true,
          state: { kind: "active", periodEndsAt: null, renews: false },
        },
        ON,
      ).lines[0],
    ).toBe("Your subscription will not renew.");
  });

  it("a failed payment asks for the card", () => {
    expect(billingView(BILLING_FIXTURES["payment-failed"].access, ON)).toEqual({
      lines: ["A payment did not go through.", "Update the card to keep your subscription."],
      action: "portal",
    });
  });

  it("no subscription offers the free trial while one is available, else Subscribe", () => {
    const none = BILLING_FIXTURES["start-trial"].access;
    expect(billingView(none, ON)).toEqual({
      lines: [
        "This workspace does not have a subscription.",
        "Start a 7-day free trial, then $39.99 a month for up to 10 teachers. A card is needed to start, and nothing is charged if you cancel before the trial ends.",
      ],
      action: "trial",
    });
    expect(
      billingView(BILLING_FIXTURES.subscribe.access, { ...ON, trialAvailable: false }),
    ).toEqual({
      lines: [
        "Your subscription has ended.",
        "Subscribe for $39.99 a month, for up to 10 teachers.",
      ],
      action: "subscribe",
    });
  });

  it("another teacher sees the status and who to ask, never a button", () => {
    for (const name of BILLING_FIXTURE_NAMES) {
      const fixture = BILLING_FIXTURES[name];
      const view = billingView(as(fixture.access, false), fixture);
      expect(view.action).toBeNull();
      if (fixture.access.state.kind !== "free") {
        expect(view.lines.at(-1)).toBe(BILLING_ASK_FOUNDER);
      }
      expect(view.lines.join(" ")).not.toMatch(/Start a|Subscribe for|Update the card/);
    }
  });

  it("without Stripe set up, says where things stand and offers nothing", () => {
    for (const name of BILLING_FIXTURE_NAMES) {
      const fixture = BILLING_FIXTURES[name];
      const view = billingView(fixture.access, { configured: false, trialAvailable: true });
      expect(view.action).toBeNull();
      expect(view.lines.join(" ")).not.toMatch(/Start a|Subscribe for/);
    }
    expect(
      billingView(BILLING_FIXTURES["not-configured"].access, {
        configured: false,
        trialAvailable: true,
      }).lines,
    ).toEqual(["This workspace does not have a subscription."]);
  });

  it("uses none of the words the glossary keeps out of the interface", () => {
    const all = [
      ...BILLING_FIXTURE_NAMES.flatMap((name) => {
        const fixture = BILLING_FIXTURES[name];
        return [
          ...billingView(fixture.access, fixture).lines,
          ...billingView(as(fixture.access, false), fixture).lines,
        ];
      }),
      ...Object.values(BILLING_REFUSAL_MESSAGES),
    ].join(" ");
    expect(all).not.toMatch(
      /\b(org|organization|founder|member|seat|paywall|plan|tier|upgrade|beta|grandfather|pass)\b/i,
    );
  });
});

describe("billingConfirmation", () => {
  it("thanks the teacher only for a trial or a subscription the page can see", () => {
    expect(billingConfirmation(BILLING_FIXTURES.trial.access)).toBe(
      "Thank you. Your free trial has started.",
    );
    expect(billingConfirmation(BILLING_FIXTURES.active.access)).toBe(
      "Thank you. Your subscription has started.",
    );
    expect(billingConfirmation(BILLING_FIXTURES["start-trial"].access)).toBeNull();
  });
});

describe("parseBillingFixture", () => {
  it("names a fixture, or falls back to the trial offer", () => {
    expect(parseBillingFixture("active")).toBe("active");
    expect(parseBillingFixture("nope")).toBe("start-trial");
    expect(parseBillingFixture(undefined)).toBe("start-trial");
  });
});
