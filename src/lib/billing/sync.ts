/**
 * `syncWorkspaceBilling` (#518, ADR 0016 "The catalog and the sync"): the only writer of
 * `public.workspace_billing`.
 *
 * It never trusts an event's payload. Given a Stripe customer id, it asks Stripe for the customer
 * and the customer's newest subscription as they are now, and makes the workspace's one row say
 * exactly that. An event that arrives late, twice, or before an earlier one therefore cannot roll
 * the row back: whichever delivery runs last writes what Stripe says at that moment. Running it
 * again with nothing changed in Stripe writes nothing (`unchanged`).
 *
 * The contract with the Checkout route (#519), which creates the customer:
 *   - `customer.metadata.org_id`     the workspace (`orgs.id`) the customer pays for. Required: a
 *                                    customer without it is reported `no_workspace` and nothing is
 *                                    written.
 *   - `customer.metadata.profile_id` the teacher who started Checkout (the workspace's founder).
 *                                    Read only to record a free trial (`record_trial_use`).
 *   - one customer per workspace, reused for every later Checkout. A workspace whose row already
 *     names another customer is reported `customer_mismatch` and left alone for the owner.
 */
import type Stripe from "stripe";

/** The columns the sync owns. `created_at` and `updated_at` are the database's. */
export interface WorkspaceBillingRow {
  org_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  status: SubscriptionStatus | null;
  price_lookup_key: string | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  billing_email: string | null;
  livemode: boolean;
}

/** The statuses `workspace_billing_status_check` allows: every one Stripe documents. */
export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "paused",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** The narrow part of the Stripe client the sync uses: two reads, nothing else. */
export interface StripeReader {
  customers: {
    retrieve(id: string): Promise<Stripe.Customer | Stripe.DeletedCustomer>;
  };
  subscriptions: {
    list(params: Stripe.SubscriptionListParams): Promise<{ data: Stripe.Subscription[] }>;
  };
}

/** What the sync needs from the database, all through the service role (`billingStore.ts`). */
export interface BillingStore {
  findByCustomer(customerId: string): Promise<WorkspaceBillingRow | null>;
  findByOrg(orgId: string): Promise<WorkspaceBillingRow | null>;
  upsert(row: WorkspaceBillingRow): Promise<void>;
  mayStartTrial(profileId: string, orgId: string): Promise<boolean>;
  /** `no_account`: the profile no longer exists (P0002), so there is nobody to record. */
  recordTrialUse(
    profileId: string,
    orgId: string,
    subscriptionId: string,
  ): Promise<"recorded" | "no_account">;
}

export type SyncOutcome =
  | { kind: "written"; orgId: string; trialRecorded: boolean }
  | { kind: "unchanged"; orgId: string; trialRecorded: boolean }
  | { kind: "no_workspace" }
  | { kind: "customer_mismatch"; orgId: string };

export type SyncLog = (message: string, details: Record<string, unknown>) => void;

export interface SyncDeps {
  stripe: StripeReader;
  store: BillingStore;
  log?: SyncLog;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;

/** A Stripe customer id, or null for anything else (a missing or malformed one). */
export function asCustomerId(value: unknown): string | null {
  const id =
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "id" in value
        ? (value as { id: unknown }).id
        : null;
  return typeof id === "string" && CUSTOMER_ID.test(id) ? id : null;
}

function metadataUuid(customer: Stripe.Customer, key: string): string | null {
  const value = customer.metadata?.[key]?.trim();
  return value && UUID.test(value) ? value.toLowerCase() : null;
}

function isoFromUnix(seconds: number | null | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

function knownStatus(status: string): SubscriptionStatus {
  const known = SUBSCRIPTION_STATUSES.find((candidate) => candidate === status);
  // Thrown, so the webhook answers 500 and Stripe retries once the code knows the new status.
  if (!known) throw new Error(`unknown Stripe subscription status: ${status}`);
  return known;
}

/** The newest by `created`; Stripe lists newest first, but the sync does not lean on that. */
export function newestSubscription(
  subscriptions: readonly Stripe.Subscription[],
): Stripe.Subscription | null {
  let newest: Stripe.Subscription | null = null;
  for (const subscription of subscriptions) {
    if (!newest || subscription.created > newest.created) newest = subscription;
  }
  return newest;
}

/**
 * The row for one workspace, from the customer and its newest subscription. Since API
 * 2025-03-31 `current_period_end` lives on the subscription item, not the subscription; a
 * workspace subscription has exactly one item (the one price), so the first is the one.
 */
export function billingRowFrom(input: {
  orgId: string;
  customerId: string;
  customer: Stripe.Customer | Stripe.DeletedCustomer;
  subscription: Stripe.Subscription | null;
}): WorkspaceBillingRow {
  const { orgId, customerId, customer, subscription } = input;
  const email = "deleted" in customer && customer.deleted ? null : (customer.email ?? null);
  const item = subscription?.items.data[0] ?? null;
  const price = item?.price ?? null;
  return {
    org_id: orgId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription?.id ?? null,
    status: subscription ? knownStatus(subscription.status) : null,
    price_lookup_key: price?.lookup_key ?? null,
    current_period_end: isoFromUnix(item?.current_period_end),
    trial_end: isoFromUnix(subscription?.trial_end),
    cancel_at_period_end: subscription?.cancel_at_period_end ?? false,
    billing_email: email,
    livemode: subscription?.livemode ?? ("livemode" in customer ? customer.livemode : false),
  };
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}

/** Whether the stored row already says what Stripe says. Timestamps compare as instants. */
export function sameBilling(stored: WorkspaceBillingRow, next: WorkspaceBillingRow): boolean {
  return (
    stored.org_id === next.org_id &&
    stored.stripe_customer_id === next.stripe_customer_id &&
    stored.stripe_subscription_id === next.stripe_subscription_id &&
    stored.status === next.status &&
    stored.price_lookup_key === next.price_lookup_key &&
    sameInstant(stored.current_period_end, next.current_period_end) &&
    sameInstant(stored.trial_end, next.trial_end) &&
    stored.cancel_at_period_end === next.cancel_at_period_end &&
    stored.billing_email === next.billing_email &&
    stored.livemode === next.livemode
  );
}

/**
 * Records the free trial when Stripe reports one and neither this teacher nor this workspace has
 * one on record. `may_start_trial` is the only read the service role has of `private.trial_uses`:
 * false means a row already exists for this person, their address or this workspace (this
 * subscription's, recorded by an earlier delivery, or an older one), so nothing is added. That
 * also makes it safe to run on every delivery while the subscription is trialing.
 */
async function recordTrialIfNew(
  deps: SyncDeps,
  customer: Stripe.Customer | Stripe.DeletedCustomer,
  orgId: string,
  subscription: Stripe.Subscription | null,
): Promise<boolean> {
  if (subscription?.status !== "trialing" || ("deleted" in customer && customer.deleted)) {
    return false;
  }
  const profileId = metadataUuid(customer, "profile_id");
  if (!profileId) {
    deps.log?.("trialing subscription without a profile_id on its customer", {
      customer: customer.id,
      subscription: subscription.id,
    });
    return false;
  }
  if (!(await deps.store.mayStartTrial(profileId, orgId))) return false;
  const result = await deps.store.recordTrialUse(profileId, orgId, subscription.id);
  if (result === "no_account") {
    deps.log?.("trial not recorded: the profile no longer exists", {
      customer: customer.id,
      subscription: subscription.id,
    });
    return false;
  }
  return true;
}

export async function syncWorkspaceBilling(
  customerId: string,
  deps: SyncDeps,
): Promise<SyncOutcome> {
  if (!asCustomerId(customerId)) throw new Error("not a Stripe customer id");

  const [customer, list] = await Promise.all([
    deps.stripe.customers.retrieve(customerId),
    deps.stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
      expand: ["data.items.data.price"],
    }),
  ]);
  const subscription = newestSubscription(list.data);
  const stored = await deps.store.findByCustomer(customerId);

  // A deleted customer has no metadata left; the row it already has still names its workspace.
  const deleted = "deleted" in customer && customer.deleted;
  const fromMetadata = deleted ? null : metadataUuid(customer as Stripe.Customer, "org_id");
  const orgId = fromMetadata ?? stored?.org_id ?? null;
  if (!orgId) {
    deps.log?.("customer has no org_id in its metadata", { customer: customerId });
    return { kind: "no_workspace" };
  }
  if (stored && stored.org_id !== orgId) {
    deps.log?.("customer's org_id differs from its row", { customer: customerId, org: orgId });
    return { kind: "customer_mismatch", orgId };
  }
  const current = stored ?? (await deps.store.findByOrg(orgId));
  if (current && current.stripe_customer_id !== customerId) {
    deps.log?.("workspace already has another customer", { customer: customerId, org: orgId });
    return { kind: "customer_mismatch", orgId };
  }

  const row = billingRowFrom({ orgId, customerId, customer, subscription });
  // Before the row: if recording fails the delivery fails and Stripe retries the whole sync.
  const trialRecorded = await recordTrialIfNew(deps, customer, orgId, subscription);
  if (current && sameBilling(current, row)) return { kind: "unchanged", orgId, trialRecorded };
  await deps.store.upsert(row);
  return { kind: "written", orgId, trialRecorded };
}
