/**
 * The Billing section's states, for its component tests, the gallery (`/gallery/billing`) and the
 * screenshots (#519). Each is what `toWorkspaceAccess` makes of one `workspace_access()` row, plus
 * the two things the page knows besides: whether Stripe is set up here and whether a free trial is
 * still on offer. No Stripe ids and nothing about any real workspace.
 */
import type { WorkspaceAccess } from "./access";

export interface BillingFixture {
  label: string;
  access: WorkspaceAccess;
  configured: boolean;
  trialAvailable: boolean;
}

const TRIAL_END = "2026-11-03T15:00:00Z";
const PERIOD_END = "2026-12-03T15:00:00Z";

export const BILLING_FIXTURES = {
  free: {
    label: "Free access",
    access: { hasAccess: true, canManage: true, state: { kind: "free", grant: "beta" } },
    configured: true,
    trialAvailable: true,
  },
  trial: {
    label: "Free trial",
    access: {
      hasAccess: true,
      canManage: true,
      state: { kind: "trial", endsAt: TRIAL_END, convertsToPaid: true },
    },
    configured: true,
    trialAvailable: false,
  },
  "trial-cancelled": {
    label: "Free trial, cancelled",
    access: {
      hasAccess: true,
      canManage: true,
      state: { kind: "trial", endsAt: TRIAL_END, convertsToPaid: false },
    },
    configured: true,
    trialAvailable: false,
  },
  active: {
    label: "Subscribed",
    access: {
      hasAccess: true,
      canManage: true,
      state: { kind: "active", periodEndsAt: PERIOD_END, renews: true },
    },
    configured: true,
    trialAvailable: false,
  },
  ending: {
    label: "Subscription ending",
    access: {
      hasAccess: true,
      canManage: true,
      state: { kind: "active", periodEndsAt: PERIOD_END, renews: false },
    },
    configured: true,
    trialAvailable: false,
  },
  "payment-failed": {
    label: "Payment failed",
    access: {
      hasAccess: true,
      canManage: true,
      state: { kind: "payment_failed", periodEndsAt: PERIOD_END },
    },
    configured: true,
    trialAvailable: false,
  },
  "start-trial": {
    label: "No subscription, free trial on offer",
    access: { hasAccess: false, canManage: true, state: { kind: "none", status: null } },
    configured: true,
    trialAvailable: true,
  },
  subscribe: {
    label: "Subscription ended, no free trial",
    access: { hasAccess: false, canManage: true, state: { kind: "none", status: "canceled" } },
    configured: true,
    trialAvailable: false,
  },
  colleague: {
    label: "A colleague's view",
    access: {
      hasAccess: true,
      canManage: false,
      state: { kind: "active", periodEndsAt: PERIOD_END, renews: true },
    },
    configured: true,
    trialAvailable: false,
  },
  "not-configured": {
    label: "Stripe not set up here",
    access: { hasAccess: false, canManage: true, state: { kind: "none", status: null } },
    configured: false,
    trialAvailable: true,
  },
} as const satisfies Record<string, BillingFixture>;

export type BillingFixtureName = keyof typeof BILLING_FIXTURES;

export const BILLING_FIXTURE_NAMES = Object.keys(BILLING_FIXTURES) as BillingFixtureName[];

export function parseBillingFixture(value: unknown): BillingFixtureName {
  return typeof value === "string" && value in BILLING_FIXTURES
    ? (value as BillingFixtureName)
    : "start-trial";
}
