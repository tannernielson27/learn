import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
  asCustomerId,
  billingRowFrom,
  newestSubscription,
  sameBilling,
  syncWorkspaceBilling,
  type WorkspaceBillingRow,
} from "./sync";
import {
  CUSTOMER,
  ORG,
  OTHER_ORG,
  PROFILE,
  T,
  customer,
  fakeStore,
  fakeStripe,
  subscription,
} from "./testing/fakes";

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

function setup(
  state: { customer?: Stripe.Customer | Stripe.DeletedCustomer; subs?: Stripe.Subscription[] },
  rows: WorkspaceBillingRow[] = [],
) {
  const stripe = fakeStripe({
    customer: state.customer ?? customer(),
    subscriptions: state.subs ?? [subscription()],
  });
  const db = fakeStore(rows);
  const log = vi.fn();
  const run = () => syncWorkspaceBilling(CUSTOMER, { stripe: stripe.reader, store: db.store, log });
  return { stripe, db, log, run };
}

describe("billingRowFrom", () => {
  it("maps every column, current_period_end from the item and not the subscription", () => {
    const sub = subscription({
      status: "active",
      cancel_at_period_end: true,
      trial_end: null,
      periodEnd: T.nextPeriodEnd,
      livemode: true,
      lookupKey: "learn_monthly_v1",
    });
    // A stray subscription-level field (pre-2025 shape) must not be what is read.
    (sub as unknown as Record<string, unknown>).current_period_end = 1;
    expect(
      billingRowFrom({ orgId: ORG, customerId: CUSTOMER, customer: customer(), subscription: sub }),
    ).toEqual({
      org_id: ORG,
      stripe_customer_id: CUSTOMER,
      stripe_subscription_id: "sub_Test01",
      status: "active",
      price_lookup_key: "learn_monthly_v1",
      current_period_end: iso(T.nextPeriodEnd),
      trial_end: null,
      cancel_at_period_end: true,
      billing_email: "founder@school.test",
      livemode: true,
    });
  });

  it("maps a trial's end", () => {
    const row = billingRowFrom({
      orgId: ORG,
      customerId: CUSTOMER,
      customer: customer(),
      subscription: subscription(),
    });
    expect(row.status).toBe("trialing");
    expect(row.trial_end).toBe(iso(T.trialEnd));
    expect(row.current_period_end).toBe(iso(T.periodEnd));
  });

  it("writes a customer with no subscription yet as a row with no status", () => {
    const row = billingRowFrom({
      orgId: ORG,
      customerId: CUSTOMER,
      customer: customer({ email: null, livemode: true }),
      subscription: null,
    });
    expect(row).toMatchObject({
      stripe_subscription_id: null,
      status: null,
      price_lookup_key: null,
      current_period_end: null,
      trial_end: null,
      cancel_at_period_end: false,
      billing_email: null,
      livemode: true,
    });
  });

  it("keeps no address for a deleted customer", () => {
    const deleted = { id: CUSTOMER, object: "customer", deleted: true } as Stripe.DeletedCustomer;
    const row = billingRowFrom({
      orgId: ORG,
      customerId: CUSTOMER,
      customer: deleted,
      subscription: subscription({ status: "canceled" }),
    });
    expect(row.billing_email).toBeNull();
    expect(row.status).toBe("canceled");
  });

  it("throws on a status the table does not allow, so the delivery is retried", () => {
    const sub = subscription({ status: "brand_new" as Stripe.Subscription.Status });
    expect(() =>
      billingRowFrom({ orgId: ORG, customerId: CUSTOMER, customer: customer(), subscription: sub }),
    ).toThrow("unknown Stripe subscription status");
  });
});

describe("helpers", () => {
  it("reads a customer id from a string or an expanded object, and nothing else", () => {
    expect(asCustomerId(CUSTOMER)).toBe(CUSTOMER);
    expect(asCustomerId({ id: CUSTOMER })).toBe(CUSTOMER);
    expect(asCustomerId(null)).toBeNull();
    expect(asCustomerId("cus_")).toBeNull();
    expect(asCustomerId("cus_x,org_id.eq.1")).toBeNull();
    expect(asCustomerId({ id: 3 })).toBeNull();
  });

  it("picks the newest subscription by created, whatever order the list is in", () => {
    const old = subscription({ id: "sub_old", created: 10 });
    const fresh = subscription({ id: "sub_new", created: 20 });
    expect(newestSubscription([old, fresh])?.id).toBe("sub_new");
    expect(newestSubscription([fresh, old])?.id).toBe("sub_new");
    expect(newestSubscription([])).toBeNull();
  });

  it("compares timestamps as instants, as Postgres returns them in another format", () => {
    const row = billingRowFrom({
      orgId: ORG,
      customerId: CUSTOMER,
      customer: customer(),
      subscription: subscription(),
    });
    const stored = {
      ...row,
      current_period_end: "2026-11-04T00:00:00+00:00",
      trial_end: "2026-11-04T00:00:00+00:00",
    };
    expect(sameBilling(stored, row)).toBe(true);
    expect(sameBilling({ ...stored, trial_end: null }, row)).toBe(false);
    expect(sameBilling({ ...stored, cancel_at_period_end: true }, row)).toBe(false);
  });
});

describe("syncWorkspaceBilling", () => {
  it("re-fetches the customer and every subscription with the price expanded", async () => {
    const { stripe, run } = setup({});
    await run();
    expect(stripe.calls.retrieve).toEqual([CUSTOMER]);
    expect(stripe.calls.list).toEqual([
      { customer: CUSTOMER, status: "all", limit: 10, expand: ["data.items.data.price"] },
    ]);
  });

  it("writes exactly one row for the workspace in the customer's metadata", async () => {
    const { db, run } = setup({});
    expect(await run()).toEqual({ kind: "written", orgId: ORG, trialRecorded: true });
    expect(db.writes).toHaveLength(1);
    expect([...db.rows.keys()]).toEqual([ORG]);
    expect(db.rows.get(ORG)?.status).toBe("trialing");
  });

  it("writes nothing when Stripe says what the row already says", async () => {
    const { db, run } = setup({});
    await run();
    expect(await run()).toEqual({ kind: "unchanged", orgId: ORG, trialRecorded: false });
    expect(db.writes).toHaveLength(1);
  });

  it("records a trial once, for the teacher in the metadata", async () => {
    const { db, run } = setup({});
    await run();
    await run();
    expect(db.trials).toEqual([{ profile: PROFILE, org: ORG, subscription: "sub_Test01" }]);
  });

  it("records no trial for a subscription that is not trialing", async () => {
    const { db, run } = setup({ subs: [subscription({ status: "active", trial_end: null })] });
    await run();
    expect(db.trials).toEqual([]);
  });

  it("records no second trial when the teacher or workspace already had one", async () => {
    const { db, run } = setup({ subs: [subscription({ id: "sub_second" })] });
    db.trials.push({ profile: PROFILE, org: OTHER_ORG, subscription: "sub_first" });
    expect((await run()).kind).toBe("written");
    expect(db.trials).toHaveLength(1);
  });

  it("writes the row without a trial when the metadata names no profile", async () => {
    const { db, log, run } = setup({ customer: customer({ metadata: { org_id: ORG } }) });
    expect(await run()).toMatchObject({ kind: "written", trialRecorded: false });
    expect(db.trials).toEqual([]);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("profile_id"), expect.any(Object));
  });

  it("writes the row when the teacher's account has since been deleted", async () => {
    const { db, log, run } = setup({});
    db.knownProfiles.clear();
    expect(await run()).toMatchObject({ kind: "written", trialRecorded: false });
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("no longer exists"),
      expect.any(Object),
    );
  });

  it("writes nothing for a customer with no workspace in its metadata", async () => {
    for (const metadata of [{}, { org_id: "not-a-uuid" }] as Stripe.Metadata[]) {
      const { db, log, run } = setup({ customer: customer({ metadata }) });
      expect(await run()).toEqual({ kind: "no_workspace" });
      expect(db.writes).toEqual([]);
      expect(log).toHaveBeenCalled();
    }
  });

  it("keeps following a deleted customer through the row it already has", async () => {
    const { db, run } = setup({});
    await run();
    const deleted = { id: CUSTOMER, object: "customer", deleted: true } as Stripe.DeletedCustomer;
    const after = setup({ customer: deleted, subs: [subscription({ status: "canceled" })] }, [
      ...db.rows.values(),
    ]);
    expect((await after.run()).kind).toBe("written");
    expect(after.db.rows.get(ORG)).toMatchObject({ status: "canceled", billing_email: null });
  });

  it("leaves a workspace alone whose row names another customer", async () => {
    const { db, run } = setup({});
    await run();
    const stored = { ...db.rows.get(ORG)!, stripe_customer_id: "cus_Other" };
    const second = setup({}, [stored]);
    expect(await second.run()).toEqual({ kind: "customer_mismatch", orgId: ORG });
    expect(second.db.writes).toEqual([]);
  });

  it("leaves a row alone when the customer's metadata moved to another workspace", async () => {
    const { db, run } = setup({});
    await run();
    const moved = setup({ customer: customer({ metadata: { org_id: OTHER_ORG } }) }, [
      ...db.rows.values(),
    ]);
    expect(await moved.run()).toEqual({ kind: "customer_mismatch", orgId: OTHER_ORG });
    expect(moved.db.writes).toEqual([]);
  });

  it("refuses something that is not a customer id before calling anyone", async () => {
    const { stripe, db } = setup({});
    await expect(
      syncWorkspaceBilling("sub_123", { stripe: stripe.reader, store: db.store }),
    ).rejects.toThrow("not a Stripe customer id");
    expect(stripe.calls.retrieve).toEqual([]);
  });
});
