/**
 * The billing banner's states (#522), for its component tests, the gallery
 * (`/gallery/billing-banner`) and the screenshots. Each is what `billingBanner` makes of one
 * workspace state at a fixed `now`, so the dates never drift. Nothing about any real workspace.
 */
import type { WorkspaceAccess } from "./access";
import { billingBanner, type BillingBanner, type BillingBannerOptions } from "./banner";

/** 3 November 2026, 10:00 in Mountain time. */
export const BANNER_FIXTURE_NOW = new Date("2026-11-03T17:00:00Z");

interface BannerFixture {
  label: string;
  access: WorkspaceAccess;
  hadGrant: boolean;
}

const TRIAL_END = "2026-11-05T17:00:00Z";
const PERIOD_END = "2026-11-08T17:00:00Z";

const FIXTURES = {
  "trial-ending": {
    label: "Free trial ends within 3 days",
    access: {
      hasAccess: true,
      canManage: true,
      state: { kind: "trial", endsAt: TRIAL_END, convertsToPaid: true },
    },
    hadGrant: false,
  },
  "trial-ending-colleague": {
    label: "Free trial ends within 3 days, a colleague's view",
    access: {
      hasAccess: true,
      canManage: false,
      state: { kind: "trial", endsAt: TRIAL_END, convertsToPaid: true },
    },
    hadGrant: false,
  },
  "payment-failed": {
    label: "Payment failed",
    access: {
      hasAccess: true,
      canManage: true,
      state: { kind: "payment_failed", periodEndsAt: PERIOD_END },
    },
    hadGrant: false,
  },
  "payment-failed-colleague": {
    label: "Payment failed, a colleague's view",
    access: {
      hasAccess: true,
      canManage: false,
      state: { kind: "payment_failed", periodEndsAt: PERIOD_END },
    },
    hadGrant: false,
  },
  "subscription-ending": {
    label: "Subscription ends within 7 days",
    access: {
      hasAccess: true,
      canManage: true,
      state: { kind: "active", periodEndsAt: PERIOD_END, renews: false },
    },
    hadGrant: false,
  },
  "access-ended": {
    label: "Free access has ended",
    access: { hasAccess: false, canManage: true, state: { kind: "none", status: null } },
    hadGrant: true,
  },
  "access-ended-colleague": {
    label: "Free access has ended, a colleague's view",
    access: { hasAccess: false, canManage: false, state: { kind: "none", status: null } },
    hadGrant: true,
  },
} as const satisfies Record<string, BannerFixture>;

export type BannerFixtureName = keyof typeof FIXTURES;

export const BANNER_FIXTURE_NAMES = Object.keys(FIXTURES) as BannerFixtureName[];

export function bannerFixtureLabel(name: BannerFixtureName): string {
  return FIXTURES[name].label;
}

/** The banner a fixture draws. Never null: every fixture is a state that has one. */
export function bannerFixture(name: BannerFixtureName): BillingBanner {
  const fixture: BannerFixture = FIXTURES[name];
  const options: BillingBannerOptions = {
    now: BANNER_FIXTURE_NOW,
    configured: true,
    hadGrant: fixture.hadGrant,
  };
  const banner = billingBanner(fixture.access, options);
  if (!banner) throw new Error(`banner fixture ${name} draws no banner`);
  return banner;
}

export function parseBannerFixture(value: unknown): BannerFixtureName {
  return typeof value === "string" && value in FIXTURES
    ? (value as BannerFixtureName)
    : "trial-ending";
}
