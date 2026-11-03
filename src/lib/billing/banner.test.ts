import { describe, expect, it } from "vitest";
import type { WorkspaceAccess } from "./access";
import { BILLING_BANNER_LINK, billingBanner, mountainDaysUntil } from "./banner";

// 3 November 2026, 10:00 in Mountain time (MST, UTC-7: daylight time ended on 1 November).
const NOW = new Date("2026-11-03T17:00:00Z");

const founder = (state: WorkspaceAccess["state"], hasAccess = true): WorkspaceAccess => ({
  hasAccess,
  canManage: true,
  state,
});
const colleague = (state: WorkspaceAccess["state"], hasAccess = true): WorkspaceAccess => ({
  hasAccess,
  canManage: false,
  state,
});
const trial = (endsAt: string | null, convertsToPaid = true) =>
  ({ kind: "trial", endsAt, convertsToPaid }) as const;
const ending = (periodEndsAt: string | null) =>
  ({ kind: "active", periodEndsAt, renews: false }) as const;

const base = { now: NOW, configured: true, hadGrant: false };

describe("mountainDaysUntil", () => {
  it("counts calendar days in Mountain time, not 24-hour spans", () => {
    // 23:30 on 3 November in Denver is 06:30 UTC on 4 November: still today there.
    expect(mountainDaysUntil(new Date("2026-11-04T06:30:00Z"), NOW)).toBe(0);
    // 00:30 on 4 November in Denver.
    expect(mountainDaysUntil(new Date("2026-11-04T07:30:00Z"), NOW)).toBe(1);
    expect(mountainDaysUntil(new Date("2026-11-02T17:00:00Z"), NOW)).toBe(-1);
  });

  it("counts across the change from daylight time", () => {
    const before = new Date("2026-10-31T17:00:00Z"); // 11:00 MDT, 31 October
    expect(mountainDaysUntil(new Date("2026-11-03T17:00:00Z"), before)).toBe(3);
  });
});

describe("billingBanner: nothing to say", () => {
  it("is null without billing state", () => {
    expect(billingBanner(null, base)).toBeNull();
  });

  it("is null when Stripe is not set up here, whatever the state", () => {
    const off = { ...base, configured: false };
    expect(billingBanner(founder(trial("2026-11-04T17:00:00Z")), off)).toBeNull();
    expect(billingBanner(founder({ kind: "payment_failed", periodEndsAt: null }), off)).toBeNull();
    expect(
      billingBanner(founder({ kind: "none", status: null }, false), { ...off, hadGrant: true }),
    ).toBeNull();
  });

  it.each(["exempt", "grandfathered", "beta"] as const)("is null on a %s grant", (grant) => {
    expect(billingBanner(founder({ kind: "free", grant }), base)).toBeNull();
  });

  it("is null for a subscription that renews", () => {
    const renews = { kind: "active", periodEndsAt: "2026-11-04T17:00:00Z", renews: true } as const;
    expect(billingBanner(founder(renews), base)).toBeNull();
  });

  it("is null for a trial with more than 3 days left", () => {
    // 7 November in Denver is 4 days away.
    expect(billingBanner(founder(trial("2026-11-07T17:00:00Z")), base)).toBeNull();
  });

  it("is null for a trial with no end date, or one already past", () => {
    expect(billingBanner(founder(trial(null)), base)).toBeNull();
    expect(billingBanner(founder(trial("2026-11-03T16:00:00Z")), base)).toBeNull();
  });

  it("is null for a workspace that never had a subscription or free access", () => {
    expect(billingBanner(founder({ kind: "none", status: null }, false), base)).toBeNull();
    expect(billingBanner(founder({ kind: "none", status: "canceled" }, false), base)).toBeNull();
  });
});

describe("billingBanner: the free trial ends soon", () => {
  it.each([
    ["today", "2026-11-04T06:59:00Z", "3 November 2026"],
    ["tomorrow", "2026-11-04T17:00:00Z", "4 November 2026"],
    ["in 3 days, the last minute of that day", "2026-11-07T06:59:00Z", "6 November 2026"],
  ])("tells the founder when it ends %s", (_, endsAt, date) => {
    expect(billingBanner(founder(trial(endsAt)), base)).toEqual({
      kind: "trial_ending",
      message: `Your free trial ends on ${date}.`,
      link: BILLING_BANNER_LINK.manage,
      note: null,
    });
  });

  it("says nothing at the first minute of the fourth day", () => {
    // 00:00 on 7 November in Denver.
    expect(billingBanner(founder(trial("2026-11-07T07:00:00Z")), base)).toBeNull();
  });

  it("also tells a founder whose trial will not turn into a subscription", () => {
    expect(billingBanner(founder(trial("2026-11-05T17:00:00Z", false)), base)?.message).toBe(
      "Your free trial ends on 5 November 2026.",
    );
  });

  it("tells another teacher who manages billing, with no link", () => {
    expect(billingBanner(colleague(trial("2026-11-05T17:00:00Z")), base)).toEqual({
      kind: "trial_ending",
      message: "Your free trial ends on 5 November 2026.",
      link: null,
      note: "The person who started your workspace manages billing.",
    });
  });
});

describe("billingBanner: a payment did not go through", () => {
  it("asks the founder to update the card, whatever the date", () => {
    expect(
      billingBanner(
        founder({ kind: "payment_failed", periodEndsAt: "2026-12-03T17:00:00Z" }),
        base,
      ),
    ).toEqual({
      kind: "payment_failed",
      message: "Your last payment did not go through.",
      link: BILLING_BANNER_LINK.manage,
      note: "Update the card to keep your subscription.",
    });
  });

  it("tells another teacher who manages billing", () => {
    expect(billingBanner(colleague({ kind: "payment_failed", periodEndsAt: null }), base)).toEqual({
      kind: "payment_failed",
      message: "Your last payment did not go through.",
      link: null,
      note: "The person who started your workspace manages billing.",
    });
  });
});

describe("billingBanner: the subscription ends soon", () => {
  it.each([
    ["today", "2026-11-04T06:59:00Z", "3 November 2026"],
    ["in 7 days, the last minute of that day", "2026-11-11T06:59:00Z", "10 November 2026"],
  ])("tells the founder when it ends %s", (_, end, date) => {
    expect(billingBanner(founder(ending(end)), base)).toEqual({
      kind: "subscription_ending",
      message: `Your subscription ends on ${date}.`,
      link: BILLING_BANNER_LINK.manage,
      note: null,
    });
  });

  it("says nothing at the first minute of the eighth day", () => {
    expect(billingBanner(founder(ending("2026-11-11T07:00:00Z")), base)).toBeNull();
  });

  it("says nothing with no end date, or one already past", () => {
    expect(billingBanner(founder(ending(null)), base)).toBeNull();
    expect(billingBanner(founder(ending("2026-11-03T16:59:00Z")), base)).toBeNull();
  });

  it("tells another teacher who manages billing", () => {
    expect(billingBanner(colleague(ending("2026-11-05T17:00:00Z")), base)?.note).toBe(
      "The person who started your workspace manages billing.",
    );
  });
});

describe("billingBanner: free access has ended", () => {
  const ended = { ...base, hadGrant: true };

  it("offers the founder a free trial or a subscription", () => {
    expect(billingBanner(founder({ kind: "none", status: null }, false), ended)).toEqual({
      kind: "access_ended",
      message: "Your free access has ended.",
      link: BILLING_BANNER_LINK.start,
      note: null,
    });
  });

  it("also after a subscription that has since ended", () => {
    expect(billingBanner(founder({ kind: "none", status: "canceled" }, false), ended)?.kind).toBe(
      "access_ended",
    );
  });

  it("tells another teacher who manages billing", () => {
    expect(billingBanner(colleague({ kind: "none", status: null }, false), ended)).toEqual({
      kind: "access_ended",
      message: "Your free access has ended.",
      link: null,
      note: "The person who started your workspace manages billing.",
    });
  });

  it("is null while the workspace still has access some other way", () => {
    expect(billingBanner(founder({ kind: "none", status: null }, true), ended)).toBeNull();
  });
});

describe("billingBanner: wording", () => {
  it("never uses the words the glossary rules out, and the links go to Billing", () => {
    const all = [
      billingBanner(founder(trial("2026-11-04T17:00:00Z")), base),
      billingBanner(colleague({ kind: "payment_failed", periodEndsAt: null }), base),
      billingBanner(founder(ending("2026-11-05T17:00:00Z")), base),
      billingBanner(founder({ kind: "none", status: null }, false), { ...base, hadGrant: true }),
    ];
    const words = JSON.stringify(all);
    expect(words).not.toMatch(
      /\b(org|organi[sz]ation|founder|member|seat|paywall|beta|grandfather\w*|pass|plan|upgrade)\b/i,
    );
    expect(BILLING_BANNER_LINK.manage.href).toBe("/author/workspace#billing-heading");
    expect(BILLING_BANNER_LINK.start.href).toBe("/author/workspace#billing-heading");
  });
});
