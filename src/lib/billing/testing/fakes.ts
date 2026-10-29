/**
 * Stand-ins for Stripe and the billing tables, for the webhook and sync tests (#518). No network
 * and no key: the "Stripe" here is a mutable object the test changes between deliveries, which is
 * exactly what re-fetching is meant to read.
 */
import type Stripe from "stripe";
import type { BillingStore, StripeReader, WorkspaceBillingRow } from "../sync";

export const ORG = "0b9f3c1e-7a52-4d0c-9a51-2f6c1d8e4b10";
export const OTHER_ORG = "5d7e2a90-1c3b-4f8e-b6a2-9e0d4c7f1a23";
export const PROFILE = "c4a1e8b2-3f6d-4a90-8c71-5b2e9d0f6a34";
export const CUSTOMER = "cus_TestWorkspace01";

/** 2026-11-04T00:00:00Z and friends, as Stripe's unix seconds. */
export const T = {
  trialEnd: 1_793_750_400,
  periodEnd: 1_793_750_400,
  nextPeriodEnd: 1_796_428_800,
  created: 1_793_145_600,
};

export function customer(overrides: Partial<Stripe.Customer> = {}): Stripe.Customer {
  return {
    id: CUSTOMER,
    object: "customer",
    email: "founder@school.test",
    livemode: false,
    metadata: { org_id: ORG, profile_id: PROFILE },
    ...overrides,
  } as Stripe.Customer;
}

export function subscription(
  overrides: Partial<Stripe.Subscription> & {
    lookupKey?: string | null;
    periodEnd?: number;
  } = {},
): Stripe.Subscription {
  const { lookupKey = "learn_monthly_v1", periodEnd = T.periodEnd, ...rest } = overrides;
  return {
    id: "sub_Test01",
    object: "subscription",
    customer: CUSTOMER,
    status: "trialing",
    created: T.created,
    trial_end: T.trialEnd,
    cancel_at_period_end: false,
    livemode: false,
    items: {
      object: "list",
      data: [
        {
          id: "si_Test01",
          object: "subscription_item",
          current_period_end: periodEnd,
          price: { id: "price_Test01", object: "price", lookup_key: lookupKey },
        },
      ],
    },
    ...rest,
  } as unknown as Stripe.Subscription;
}

export interface StripeState {
  customer: Stripe.Customer | Stripe.DeletedCustomer;
  subscriptions: Stripe.Subscription[];
}

export function fakeStripe(state: StripeState) {
  const calls = { retrieve: [] as string[], list: [] as Stripe.SubscriptionListParams[] };
  const reader: StripeReader = {
    customers: {
      retrieve: async (id) => {
        calls.retrieve.push(id);
        return state.customer;
      },
    },
    subscriptions: {
      list: async (params) => {
        calls.list.push(params);
        return { data: state.subscriptions };
      },
    },
  };
  return { reader, calls };
}

export function fakeStore(initial: WorkspaceBillingRow[] = []) {
  const rows = new Map(initial.map((row) => [row.org_id, { ...row }]));
  const trials: { profile: string; org: string; subscription: string }[] = [];
  const writes: WorkspaceBillingRow[] = [];
  const knownProfiles = new Set([PROFILE]);
  const store: BillingStore = {
    findByCustomer: async (id) =>
      [...rows.values()].find((row) => row.stripe_customer_id === id) ?? null,
    findByOrg: async (org) => rows.get(org) ?? null,
    upsert: async (row) => {
      writes.push(row);
      rows.set(row.org_id, { ...row });
    },
    mayStartTrial: async (profile, org) =>
      !trials.some((trial) => trial.profile === profile || trial.org === org),
    recordTrialUse: async (profile, org, sub) => {
      if (!knownProfiles.has(profile)) return "no_account";
      trials.push({ profile, org, subscription: sub });
      return "recorded";
    },
  };
  return { store, rows, trials, writes, knownProfiles };
}
