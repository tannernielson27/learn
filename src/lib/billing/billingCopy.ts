/**
 * What the Billing section of the workspace page says (#519, docs/glossary.md "Subscription",
 * "Free trial", "Billing"), and which one button it offers. Pure: no React, no Next, no Stripe.
 *
 * The words never name the grant (a workspace on beta access, grandfathered or exempt is told
 * only that it has free access), never say "org", "founder", "member", "seat", "plan" or
 * "paywall", and give one price. Only the person who started the workspace gets a button, and
 * only when Stripe is set up on this deployment; everyone else reads the status and who to ask.
 */
import type { WorkspaceAccess } from "./access";

export const BILLING_PRICE = "$39.99 a month";
export const BILLING_TRIAL_DAYS = 7;

export type BillingAction = "trial" | "subscribe" | "portal";

export interface BillingView {
  /** One or two sentences about where the workspace stands. */
  lines: string[];
  /** The one button, or null for none. */
  action: BillingAction | null;
}

export const BILLING_ACTION_LABELS: Record<BillingAction, string> = {
  trial: "Start your free trial",
  subscribe: "Subscribe",
  portal: "Manage billing",
};

export const BILLING_ASK_FOUNDER = "The person who started this workspace manages billing.";

/** Why a press on a billing button did not open Stripe: one short sentence each. */
export type BillingRefusal =
  | "not_configured"
  | "not_founder"
  | "already_subscribed"
  | "no_customer"
  | "rate_limited"
  | "failed";

export const BILLING_REFUSAL_MESSAGES: Record<BillingRefusal, string> = {
  not_configured: "Billing is not available here yet.",
  not_founder: "Only the person who started this workspace can manage billing.",
  already_subscribed: "This workspace already has a subscription. Use Manage billing to change it.",
  no_customer: "This workspace has no billing to manage yet.",
  rate_limited: "Too many tries. Wait a few minutes, then try again.",
  failed: "Billing could not be opened just now. Try again in a moment.",
};

// Pinned to UTC so a date renders the same on the server and in any browser, as the rest of the
// workspace page does. Day before month, as the glossary's examples read: "3 November 2026".
const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "3 November 2026", or null for a value that is not a date. */
export function formatBillingDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : DATE.format(date);
}

export interface BillingViewOptions {
  /** Stripe is set up on this deployment (`stripeConfigFromEnv()` is not null). */
  configured: boolean;
  /** Neither this person nor this workspace has had a free trial (`may_start_trial`). */
  trialAvailable: boolean;
}

export function billingView(access: WorkspaceAccess, options: BillingViewOptions): BillingView {
  const manage = access.canManage && options.configured;
  const state = access.state;
  const lines: string[] = [];
  let action: BillingAction | null = null;

  switch (state.kind) {
    case "free":
      // Nothing to pay and nothing to manage, for anyone: no price, no button, no "ask".
      return { lines: ["This workspace has free access. There is nothing to pay."], action: null };
    case "trial": {
      const date = formatBillingDate(state.endsAt);
      lines.push(date ? `Your free trial ends on ${date}.` : "Your free trial has started.");
      lines.push(
        state.convertsToPaid
          ? `Then your subscription starts, at ${BILLING_PRICE}.`
          : "Your subscription will not start when it ends.",
      );
      action = "portal";
      break;
    }
    case "active": {
      const date = formatBillingDate(state.periodEndsAt);
      if (state.renews) {
        lines.push(date ? `Your subscription renews on ${date}.` : "Your subscription is active.");
      } else {
        lines.push(
          date ? `Your subscription ends on ${date}.` : "Your subscription will not renew.",
        );
      }
      lines.push(`${BILLING_PRICE}, for up to 10 teachers.`);
      action = "portal";
      break;
    }
    case "payment_failed":
      lines.push("A payment did not go through.");
      if (manage) lines.push("Update the card to keep your subscription.");
      action = "portal";
      break;
    case "none":
      lines.push(
        state.status === null
          ? "This workspace does not have a subscription."
          : "Your subscription has ended.",
      );
      if (manage && options.trialAvailable) {
        lines.push(
          `Start a ${BILLING_TRIAL_DAYS}-day free trial, then ${BILLING_PRICE} for up to 10 teachers. ` +
            "A card is needed to start, and nothing is charged if you cancel before the trial ends.",
        );
        action = "trial";
      } else if (manage) {
        lines.push(`Subscribe for ${BILLING_PRICE}, for up to 10 teachers.`);
        action = "subscribe";
      }
      break;
  }

  if (!access.canManage) lines.push(BILLING_ASK_FOUNDER);
  return { lines, action: manage ? action : null };
}

/** The line after a finished Checkout, once the page shows the subscription it made. */
export function billingConfirmation(access: WorkspaceAccess): string | null {
  if (access.state.kind === "trial") return "Thank you. Your free trial has started.";
  if (access.state.kind === "active") return "Thank you. Your subscription has started.";
  return null;
}
