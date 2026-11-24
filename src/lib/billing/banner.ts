/**
 * The one billing banner a teacher sees across the top of the author pages (#522, ADR 0016), or
 * none. Pure: no React, no Next, no Supabase, no Stripe, and `now` is passed in so the windows are
 * the same in a test as on a server.
 *
 * Six things are said, and only these: a free trial ends within 3 days, a payment did not go
 * through, a subscription that will not renew ends within 7 days, free access has ended with
 * nothing in its place, and, only while billing is enforced, a workspace that has never had a
 * subscription or whose subscription has ended is read-only. Everything else (free access, a
 * subscription that renews, a trial with time left, a deployment without Stripe) has no banner.
 * Students never reach this: only the author layout calls it.
 *
 * The windows count calendar days in Mountain time, the zone `formatBillingDate` words the date
 * in, so "ends on 6 November" appears on the same morning for every teacher. The words follow
 * docs/glossary.md: never "org", "founder", "member", "seat", "plan", "paywall", or the kind of
 * free access the workspace had.
 */
import type { WorkspaceAccess } from "./access";
import { formatBillingDate } from "./billingCopy";

/** A trial ending this many days away, or fewer, is mentioned. */
export const TRIAL_BANNER_DAYS = 3;
/** A subscription that will not renew is mentioned this many days before it ends, or fewer. */
export const ENDING_BANNER_DAYS = 7;

export type BillingBannerKind =
  | "trial_ending"
  | "payment_failed"
  | "subscription_ending"
  | "access_ended"
  | "not_subscribed"
  | "subscription_ended";

export interface BillingBannerLink {
  href: string;
  label: string;
}

export interface BillingBanner {
  kind: BillingBannerKind;
  /** The one sentence. */
  message: string;
  /** The way to Billing, for the person who started the workspace only. */
  link: BillingBannerLink | null;
  /** A second short sentence, or null. */
  note: string | null;
}

// The Billing section is at the foot of the workspace page; the hash scrolls to its heading.
const BILLING_HREF = "/author/workspace#billing-heading";

export const BILLING_BANNER_LINK = {
  manage: { href: BILLING_HREF, label: "Manage billing" },
  start: { href: BILLING_HREF, label: "Start a free trial or subscribe" },
  subscribe: { href: BILLING_HREF, label: "Subscribe" },
} as const satisfies Record<string, BillingBannerLink>;

export const BILLING_BANNER_ASK = "The person who started your workspace manages billing.";

export interface BillingBannerOptions {
  now: Date;
  /** Stripe is set up on this deployment. Without it there is never a banner. */
  configured: boolean;
  /**
   * `BILLING_ENFORCED` is on here. A workspace with no access is read-only only then, so only then
   * is it told so.
   */
  enforced: boolean;
  /**
   * The workspace once had free access that has since been revoked or has expired. Read only when
   * the workspace has no access (`access_grants` rows the teacher may read).
   */
  hadGrant: boolean;
}

const MOUNTAIN_DAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Denver",
});

function mountainDayNumber(date: Date): number {
  const [year, month, day] = MOUNTAIN_DAY.format(date).split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

/** How many calendar days, in Mountain time, from `now` to `end`: 0 is the same day. */
export function mountainDaysUntil(end: Date, now: Date): number {
  return mountainDayNumber(end) - mountainDayNumber(now);
}

/** The worded date when `iso` is still ahead and at most `days` Mountain days away. */
function soon(iso: string | null, now: Date, days: number): string | null {
  if (!iso) return null;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return null;
  return mountainDaysUntil(end, now) <= days ? formatBillingDate(iso) : null;
}

type MakeBanner = (
  kind: BillingBannerKind,
  message: string,
  link: BillingBannerLink,
  founderNote?: string | null,
) => BillingBanner;

/**
 * A workspace with no access: free access that ended is said whether or not billing is enforced;
 * the rest only while it is, since only then does no access mean read-only. `status` is Stripe's
 * last word on a subscription that has ended, or null when there was never one.
 */
function noAccessBanner(
  access: WorkspaceAccess,
  status: string | null,
  options: BillingBannerOptions,
  banner: MakeBanner,
): BillingBanner | null {
  if (access.hasAccess) return null;
  if (options.hadGrant) {
    return banner("access_ended", "Your free access has ended.", BILLING_BANNER_LINK.start);
  }
  if (!options.enforced) return null;
  return status === null
    ? banner(
        "not_subscribed",
        "Your workspace is read-only until it has a subscription.",
        BILLING_BANNER_LINK.start,
      )
    : banner(
        "subscription_ended",
        "Your subscription has ended.",
        BILLING_BANNER_LINK.subscribe,
        "Your workspace is read-only until you subscribe again.",
      );
}

export function billingBanner(
  access: WorkspaceAccess | null,
  options: BillingBannerOptions,
): BillingBanner | null {
  if (!access || !options.configured) return null;
  const { state } = access;
  const banner = (
    kind: BillingBannerKind,
    message: string,
    link: BillingBannerLink,
    founderNote: string | null = null,
  ): BillingBanner =>
    access.canManage
      ? { kind, message, link, note: founderNote }
      : { kind, message, link: null, note: BILLING_BANNER_ASK };

  switch (state.kind) {
    case "trial": {
      const date = soon(state.endsAt, options.now, TRIAL_BANNER_DAYS);
      return date
        ? banner("trial_ending", `Your free trial ends on ${date}.`, BILLING_BANNER_LINK.manage)
        : null;
    }
    case "payment_failed":
      return banner(
        "payment_failed",
        "Your last payment did not go through.",
        BILLING_BANNER_LINK.manage,
        "Update the card to keep your subscription.",
      );
    case "active": {
      if (state.renews) return null;
      const date = soon(state.periodEndsAt, options.now, ENDING_BANNER_DAYS);
      return date
        ? banner(
            "subscription_ending",
            `Your subscription ends on ${date}.`,
            BILLING_BANNER_LINK.manage,
          )
        : null;
    }
    case "none":
      return noAccessBanner(access, state.status, options, banner);
    case "free":
      return null;
  }
}
