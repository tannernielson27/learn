import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import type { StripeConfig } from "./stripeConfig";
import { syncWorkspaceBilling } from "./sync";
import { CUSTOMER, ORG, customer, fakeStore, fakeStripe, subscription } from "./testing/fakes";
import { HANDLED_EVENTS, customerOfEvent, handleStripeWebhook, type WebhookDeps } from "./webhook";

// Not a real secret: the tests sign their own events with it.
const SECRET = "whsec_unit_test_only";
const CONFIG: StripeConfig = {
  secretKey: "sk_test_fake",
  webhookSecret: SECRET,
  priceLookupKey: "learn_monthly_v1",
  livemode: false,
};

let eventCounter = 0;

function event(type: string, object: Record<string, unknown>, id?: string) {
  eventCounter += 1;
  return {
    id: id ?? `evt_test_${eventCounter}`,
    object: "event",
    type,
    livemode: false,
    created: 1_793_145_600 + eventCounter,
    api_version: "2026-09-30.endive",
    data: { object },
  };
}

function signed(body: object, options: { secret?: string; timestamp?: number } = {}): Request {
  const payload = JSON.stringify(body);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: options.secret ?? SECRET,
    timestamp: options.timestamp,
  });
  return new Request("https://learn.example/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
}

function harness(overrides: Partial<WebhookDeps> = {}) {
  const state = { customer: customer(), subscriptions: [subscription()] };
  const stripe = fakeStripe(state);
  const db = fakeStore();
  const claimed = new Set<string>();
  const claim = vi.fn(async ({ id }: { id: string }) => {
    if (claimed.has(id)) return false;
    claimed.add(id);
    return true;
  });
  const sync = vi.fn((customerId: string) =>
    syncWorkspaceBilling(customerId, { stripe: stripe.reader, store: db.store }),
  );
  const log = vi.fn();
  const deps: WebhookDeps = {
    config: CONFIG,
    constructEvent: (payload, header, secret) =>
      Stripe.webhooks.constructEvent(payload, header, secret),
    sync,
    claim,
    log,
    ...overrides,
  };
  return { state, stripe, db, claim, claimed, sync, log, deps };
}

const subscriptionEvent = (type: string, id?: string) =>
  event(type, { id: "sub_Test01", object: "subscription", customer: CUSTOMER }, id);

describe("handleStripeWebhook: who may call it", () => {
  it("answers 503 with billing off, before reading the body or calling anyone", async () => {
    const { deps, sync, claim } = harness({ config: null });
    const request = signed(subscriptionEvent("customer.subscription.updated"));
    const response = await handleStripeWebhook(request, deps);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "billing_not_configured" });
    expect(request.bodyUsed).toBe(false);
    expect(sync).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it("answers 400 with the same body for every bad signature, and writes nothing", async () => {
    const body = subscriptionEvent("customer.subscription.updated");
    const tampered = signed(body);
    const tamperedBody = JSON.stringify({ ...body, livemode: true });
    const requests = [
      signed(body, { secret: "whsec_someone_else" }),
      new Request(tampered.url, {
        method: "POST",
        headers: tampered.headers,
        body: tamperedBody,
      }),
      new Request("https://learn.example/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      new Request("https://learn.example/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "t=1,v1=deadbeef" },
        body: JSON.stringify(body),
      }),
      // Older than the library's 5-minute tolerance: a replay.
      signed(body, { timestamp: Math.floor(Date.now() / 1000) - 3600 }),
    ];
    for (const request of requests) {
      const { deps, sync, claim, db, log } = harness();
      const response = await handleStripeWebhook(request, deps);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_signature" });
      expect(sync).not.toHaveBeenCalled();
      expect(claim).not.toHaveBeenCalled();
      expect(db.writes).toEqual([]);
      expect(JSON.stringify(log.mock.calls)).not.toContain("whsec_");
    }
  });

  it("verifies the raw bytes: the same JSON re-serialised with other spacing is refused", async () => {
    const body = subscriptionEvent("customer.subscription.updated");
    const original = signed(body);
    const respaced = new Request(original.url, {
      method: "POST",
      headers: original.headers,
      body: JSON.stringify(body, null, 2),
    });
    const { deps } = harness();
    expect((await handleStripeWebhook(respaced, deps)).status).toBe(400);
  });
});

describe("handleStripeWebhook: what it does", () => {
  it("answers 200 to an event it does not handle, touching nothing", async () => {
    const { deps, sync, claim } = harness();
    const response = await handleStripeWebhook(
      signed(event("customer.created", { id: CUSTOMER, object: "customer" })),
      deps,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(sync).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it.each(HANDLED_EVENTS)("syncs the customer of %s, then claims the event", async (type) => {
    const object =
      type === "checkout.session.completed"
        ? { id: "cs_test_1", object: "checkout.session", customer: CUSTOMER }
        : type.startsWith("invoice.")
          ? { id: "in_test_1", object: "invoice", customer: { id: CUSTOMER, object: "customer" } }
          : { id: "sub_Test01", object: "subscription", customer: CUSTOMER };
    const { deps, sync, claim, db } = harness();
    const body = event(type, object);
    const response = await handleStripeWebhook(signed(body), deps);
    expect(response.status).toBe(200);
    expect(sync).toHaveBeenCalledWith(CUSTOMER);
    expect(claim).toHaveBeenCalledWith({ id: body.id, type, livemode: false });
    expect(sync.mock.invocationCallOrder[0]).toBeLessThan(claim.mock.invocationCallOrder[0]);
    expect(db.rows.get(ORG)?.status).toBe("trialing");
  });

  it("claims an event that names no customer and syncs nothing", async () => {
    const { deps, sync, claim } = harness();
    const body = event("checkout.session.completed", {
      id: "cs_test_2",
      object: "checkout.session",
      customer: null,
    });
    expect((await handleStripeWebhook(signed(body), deps)).status).toBe(200);
    expect(sync).not.toHaveBeenCalled();
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("answers 200 to a duplicate and writes nothing for it", async () => {
    const { deps, db, claim } = harness();
    const body = subscriptionEvent("customer.subscription.created", "evt_dup");
    const first = await handleStripeWebhook(signed(body), deps);
    const second = await handleStripeWebhook(signed(body), deps);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(db.writes).toHaveLength(1);
    expect(db.trials).toHaveLength(1);
    expect(await claim.mock.results[1].value).toBe(false);
  });

  it("leaves the newest state when events arrive in reverse order", async () => {
    const { deps, db, state } = harness();
    const created = subscriptionEvent("customer.subscription.created");
    const updated = subscriptionEvent("customer.subscription.updated");
    const canceled = subscriptionEvent("customer.subscription.deleted");

    // By the time anything is delivered, Stripe has moved on: trialing, active, then canceled.
    state.subscriptions = [subscription({ status: "canceled", cancel_at_period_end: false })];
    for (const body of [canceled, updated, created]) {
      expect((await handleStripeWebhook(signed(body), deps)).status).toBe(200);
    }
    expect(db.rows.get(ORG)?.status).toBe("canceled");
    // The late "created" and "updated" deliveries re-fetched the same state and wrote nothing.
    expect(db.writes).toHaveLength(1);
  });

  it("follows Stripe through a full life, whatever order the events come in", async () => {
    const { deps, db, state } = harness();
    await handleStripeWebhook(signed(subscriptionEvent("customer.subscription.created")), deps);
    expect(db.rows.get(ORG)?.status).toBe("trialing");

    state.subscriptions = [subscription({ status: "active", trial_end: null })];
    await handleStripeWebhook(signed(event("invoice.paid", { customer: CUSTOMER })), deps);
    expect(db.rows.get(ORG)).toMatchObject({ status: "active", trial_end: null });

    state.subscriptions = [subscription({ status: "past_due", trial_end: null })];
    // A stale trial_will_end arrives after the payment failure: it still reads past_due.
    await handleStripeWebhook(
      signed(event("invoice.payment_failed", { customer: CUSTOMER })),
      deps,
    );
    await handleStripeWebhook(
      signed(subscriptionEvent("customer.subscription.trial_will_end")),
      deps,
    );
    expect(db.rows.get(ORG)?.status).toBe("past_due");
  });

  it("answers 500 and leaves the event unclaimed when the sync fails, so the retry runs", async () => {
    const { deps, claim, claimed, db, log, stripe } = harness();
    const retrieve = stripe.reader.customers.retrieve;
    stripe.reader.customers.retrieve = async () => {
      throw new Error("Stripe is down");
    };
    const body = subscriptionEvent("customer.subscription.updated", "evt_retry");
    const failed = await handleStripeWebhook(signed(body), deps);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "sync_failed" });
    expect(claim).not.toHaveBeenCalled();
    expect(claimed.has("evt_retry")).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "error",
      "billing sync failed",
      expect.objectContaining({ event: "evt_retry", customer: CUSTOMER }),
    );

    stripe.reader.customers.retrieve = retrieve;
    const retried = await handleStripeWebhook(signed(body), deps);
    expect(retried.status).toBe(200);
    expect(claimed.has("evt_retry")).toBe(true);
    expect(db.rows.get(ORG)?.status).toBe("trialing");
  });

  it("answers 500 when the claim fails, and the retry re-syncs harmlessly", async () => {
    const claim = vi.fn(async () => {
      throw new Error("claim_stripe_event failed (57014): canceling statement");
    });
    const { deps, db } = harness({ claim });
    const response = await handleStripeWebhook(
      signed(subscriptionEvent("customer.subscription.updated")),
      deps,
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "claim_failed" });
    expect(db.writes).toHaveLength(1);
  });

  it("never logs the payload, a secret or an address", async () => {
    const { deps, log } = harness();
    await handleStripeWebhook(signed(subscriptionEvent("customer.subscription.created")), deps);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("customer.subscription.created");
    expect(logged).not.toContain("@");
    expect(logged).not.toContain("whsec_");
    expect(logged).not.toContain("sk_test");
  });

  it("answers with no-store and fixed bodies only", async () => {
    const { deps } = harness();
    const response = await handleStripeWebhook(
      signed(subscriptionEvent("customer.subscription.created")),
      deps,
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe('{"received":true}');
  });
});

describe("customerOfEvent", () => {
  it("is null for an object without a usable customer", () => {
    const of = (object: Record<string, unknown>) =>
      customerOfEvent(event("invoice.paid", object) as unknown as Stripe.Event);
    expect(of({})).toBeNull();
    expect(of({ customer: "acct_1" })).toBeNull();
    expect(of({ customer: CUSTOMER })).toBe(CUSTOMER);
  });
});
