/**
 * Start the free trial, subscribe, open the Customer Portal, and confirm a finished Checkout
 * (#519, ADR 0016 "One free trial per person and per workspace"). Everything a press on the
 * Billing section does, behind injected dependencies, so it is tested with Stripe and the
 * database faked. `checkoutDeps.ts` builds the real ones.
 *
 * Who is asking is never read from the request: the caller's account and workspace come from the
 * verified session (`requireAuthor` and `auth.getUser()`), and whether they started the workspace
 * is read again here (`founderId`) on every press. A hidden button is a courtesy; this is the
 * check.
 *
 * The contract with `syncWorkspaceBilling` (#518): one Stripe customer per workspace, made here
 * with `metadata.org_id` and `metadata.profile_id`, and reused for every later Checkout. Stripe
 * does not dedupe trials, so this asks `may_start_trial` before every Checkout and sends a trial
 * only when neither this person nor this workspace has had one.
 *
 * Errors carry no Stripe id and no key: what reaches the teacher is a `BillingRefusal`, and what
 * is logged is the step that failed and the error's type and code.
 */
import type Stripe from "stripe";
import { WORKSPACE_PATH } from "@/lib/workspace/workspace";
import { BILLING_TRIAL_DAYS, type BillingRefusal } from "./billingCopy";
import type { BillingAllowance } from "./sessionLimit";
import type { StripeConfig } from "./stripeConfig";
import {
  asCustomerId,
  syncWorkspaceBilling,
  type BillingStore,
  type StripeReader,
  type SyncLog,
  type SubscriptionStatus,
} from "./sync";

export const BILLING_RETURN_PATH = "/author/workspace/billing/return";
/** The query the workspace page reads to thank the teacher after a Checkout it confirmed. */
export const BILLING_CONFIRMED_QUERY = "billing=started";

/** Statuses that already have the workspace on a subscription: send them to the portal. */
const LIVE_STATUSES: readonly SubscriptionStatus[] = ["trialing", "active", "past_due"];

/** The part of the Stripe client this module uses, on top of the sync's two reads. */
export interface StripeBilling extends StripeReader {
  customers: StripeReader["customers"] & {
    create(
      params: Stripe.CustomerCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.Customer>;
  };
  prices: {
    list(params: Stripe.PriceListParams): Promise<{ data: Stripe.Price[] }>;
  };
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<Stripe.Checkout.Session>;
      retrieve(id: string): Promise<Stripe.Checkout.Session>;
    };
  };
  billingPortal: {
    sessions: {
      create(
        params: Stripe.BillingPortal.SessionCreateParams,
      ): Promise<Stripe.BillingPortal.Session>;
    };
  };
}

/** The signed-in teacher, from the verified session only. */
export interface BillingCaller {
  userId: string;
  email: string;
  orgId: string;
}

export interface BillingDeps {
  /** Null when Stripe is not set up on this deployment: nothing is opened. */
  config: StripeConfig | null;
  /** Built only when needed, and only with a config. */
  stripe: () => StripeBilling;
  /** The service-role store `syncWorkspaceBilling` writes through. */
  store: () => BillingStore;
  /** `orgs.founder_id` of the caller's workspace, read as the caller. */
  founderId: () => Promise<string | null>;
  /** One press counted against `billing_session`. */
  allow: () => Promise<BillingAllowance>;
  /** This site's origin, for the URLs Stripe sends the teacher back to. */
  origin: string;
  log: SyncLog;
}

export type BillingOutcome = { ok: true; url: string } | { ok: false; reason: BillingRefusal };

const refuse = (reason: BillingRefusal): BillingOutcome => ({ ok: false, reason });

/** What may be logged about a failed call: its type and code, never its message or a row. */
function errorDetails(error: unknown): Record<string, unknown> {
  if (error && typeof error === "object") {
    const { type, code, name } = error as { type?: unknown; code?: unknown; name?: unknown };
    return { error: typeof type === "string" ? type : name, code };
  }
  return { error: "unknown" };
}

/**
 * The idempotency key of the one customer a workspace gets. Two presses (a double click, two
 * tabs) within Stripe's 24 hours make one customer, not two; after that the workspace's row names
 * the customer and nothing is created.
 */
export function customerIdempotencyKey(orgId: string): string {
  return `learn-workspace-customer-${orgId}`;
}

/** The rate limit and the founder check that come before any Stripe call. */
async function admit(caller: BillingCaller, deps: BillingDeps): Promise<BillingRefusal | null> {
  if (!deps.config) return "not_configured";
  const allowance = await deps.allow();
  if (allowance === "rate_limited") return "rate_limited";
  if (allowance !== "ok") return "failed";
  const founder = await deps.founderId();
  return founder !== null && founder === caller.userId ? null : "not_founder";
}

/**
 * Builds the Checkout Session's parameters. The trial and its end behaviour are present only
 * when `trial` is true; nothing else depends on it. No `allow_promotion_codes` (ADR 0016).
 */
export function checkoutParams(input: {
  customerId: string;
  orgId: string;
  priceId: string;
  trial: boolean;
  origin: string;
}): Stripe.Checkout.SessionCreateParams {
  const { customerId, orgId, priceId, trial, origin } = input;
  return {
    mode: "subscription",
    customer: customerId,
    client_reference_id: orgId,
    line_items: [{ price: priceId, quantity: 1 }],
    payment_method_collection: "always",
    consent_collection: { terms_of_service: "required" },
    subscription_data: {
      metadata: { org_id: orgId },
      ...(trial
        ? {
            trial_period_days: BILLING_TRIAL_DAYS,
            trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          }
        : {}),
    },
    success_url: `${origin}${BILLING_RETURN_PATH}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}${WORKSPACE_PATH}`,
  };
}

/**
 * Start the free trial, or subscribe: a Checkout Session for the caller's workspace, with a trial
 * only when `may_start_trial` says so. Refused for anyone but the person who started the
 * workspace, and for a workspace already on a subscription.
 */
export async function startCheckout(
  caller: BillingCaller,
  deps: BillingDeps,
): Promise<BillingOutcome> {
  const refused = await admit(caller, deps);
  if (refused) return refuse(refused);
  const config = deps.config as StripeConfig;

  let step = "reading the workspace's billing";
  try {
    const stripe = deps.stripe();
    const store = deps.store();
    const existing = await store.findByOrg(caller.orgId);
    if (existing?.status && LIVE_STATUSES.includes(existing.status)) {
      return refuse("already_subscribed");
    }

    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      step = "creating the customer";
      const created = await stripe.customers.create(
        {
          ...(caller.email ? { email: caller.email } : {}),
          metadata: { org_id: caller.orgId, profile_id: caller.userId },
        },
        { idempotencyKey: customerIdempotencyKey(caller.orgId) },
      );
      customerId = created.id;
    }

    // Writes the row now, so it exists before the webhook, and so a subscription Stripe has and
    // the row does not yet show is seen before a second one is started.
    step = "syncing the workspace";
    const synced = await syncWorkspaceBilling(customerId, { stripe, store, log: deps.log });
    if (synced.kind !== "written" && synced.kind !== "unchanged") {
      deps.log("checkout refused: the customer does not belong to this workspace", {
        org: caller.orgId,
        outcome: synced.kind,
      });
      return refuse("failed");
    }
    const current = await store.findByOrg(caller.orgId);
    if (current?.status && LIVE_STATUSES.includes(current.status)) {
      return refuse("already_subscribed");
    }

    step = "asking whether a trial may start";
    const trial = await store.mayStartTrial(caller.userId, caller.orgId);

    step = "finding the price";
    const prices = await stripe.prices.list({
      lookup_keys: [config.priceLookupKey],
      active: true,
      limit: 1,
    });
    const price = prices.data[0];
    if (!price) {
      deps.log("checkout refused: no active price has the lookup key", {
        lookupKey: config.priceLookupKey,
      });
      return refuse("failed");
    }

    step = "creating the Checkout Session";
    const session = await stripe.checkout.sessions.create(
      checkoutParams({
        customerId,
        orgId: caller.orgId,
        priceId: price.id,
        trial,
        origin: deps.origin,
      }),
    );
    if (!session.url) return refuse("failed");
    return { ok: true, url: session.url };
  } catch (error) {
    deps.log(`checkout failed while ${step}`, { org: caller.orgId, ...errorDetails(error) });
    return refuse("failed");
  }
}

/**
 * Manage billing: a Customer Portal session for the caller's workspace's customer, where the
 * card, the invoices and cancelling live. The person who started the workspace only.
 */
export async function openPortal(
  caller: BillingCaller,
  deps: BillingDeps,
): Promise<BillingOutcome> {
  const refused = await admit(caller, deps);
  if (refused) return refuse(refused);
  try {
    const row = await deps.store().findByOrg(caller.orgId);
    if (!row) return refuse("no_customer");
    const session = await deps.stripe().billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${deps.origin}${WORKSPACE_PATH}`,
    });
    return { ok: true, url: session.url };
  } catch (error) {
    deps.log("portal failed", { org: caller.orgId, ...errorDetails(error) });
    return refuse("failed");
  }
}

const CHECKOUT_SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{1,250}$/;

/**
 * Back from Checkout: the session is fetched from Stripe, never trusted from the URL, and must be
 * one made for the caller's own workspace and finished. Then the workspace is synced at once, so
 * the page is right before the webhook lands. `ignored` for anything else, which says nothing
 * about the session: the page simply goes back to the workspace.
 */
export async function confirmCheckoutReturn(
  sessionId: string,
  caller: Pick<BillingCaller, "orgId">,
  deps: Pick<BillingDeps, "config" | "stripe" | "store" | "log">,
): Promise<"confirmed" | "ignored"> {
  if (!deps.config || !CHECKOUT_SESSION_ID.test(sessionId)) return "ignored";
  try {
    const stripe = deps.stripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.client_reference_id !== caller.orgId) {
      deps.log("checkout return for another workspace", { org: caller.orgId });
      return "ignored";
    }
    const customerId = asCustomerId(session.customer);
    if (!customerId || session.status !== "complete") return "ignored";
    const synced = await syncWorkspaceBilling(customerId, {
      stripe,
      store: deps.store(),
      log: deps.log,
    });
    return (synced.kind === "written" || synced.kind === "unchanged") &&
      synced.orgId === caller.orgId
      ? "confirmed"
      : "ignored";
  } catch (error) {
    deps.log("checkout return failed", { org: caller.orgId, ...errorDetails(error) });
    return "ignored";
  }
}

/**
 * Whether the page offers the free trial rather than Subscribe. Asked only for the person who
 * started the workspace, and only with Stripe set up. A database that cannot answer offers
 * Subscribe; `startCheckout` asks again either way, and it alone decides.
 */
export async function trialOnOffer(
  caller: Pick<BillingCaller, "userId" | "orgId">,
  deps: Pick<BillingDeps, "config" | "store" | "log">,
): Promise<boolean> {
  if (!deps.config) return false;
  try {
    return await deps.store().mayStartTrial(caller.userId, caller.orgId);
  } catch (error) {
    deps.log("may_start_trial could not answer for the page", {
      org: caller.orgId,
      ...errorDetails(error),
    });
    return false;
  }
}
