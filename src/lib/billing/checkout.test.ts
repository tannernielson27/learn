import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";
import {
  BILLING_CONFIRMED_QUERY,
  checkoutParams,
  confirmCheckoutReturn,
  customerIdempotencyKey,
  openPortal,
  startCheckout,
  trialOnOffer,
  type BillingCaller,
  type BillingDeps,
  type StripeBilling,
} from "./checkout";
import type { BillingAllowance } from "./sessionLimit";
import type { StripeConfig } from "./stripeConfig";
import type { WorkspaceBillingRow } from "./sync";
import {
  CUSTOMER,
  ORG,
  OTHER_ORG,
  PROFILE,
  customer,
  fakeStore,
  fakeStripe,
  subscription,
} from "./testing/fakes";

/**
 * The Billing section's three Server Functions, below Next: Stripe and the database are fakes,
 * the sync is the real one. What is pinned is what a press can and cannot do: only the person who
 * started the workspace gets a Checkout or a portal, a trial is asked for only when
 * `may_start_trial` allows one, a workspace already subscribed is sent to Manage billing, one
 * customer is made per workspace with the metadata the sync reads, and a return for another
 * workspace's Checkout does nothing.
 */

const COLLEAGUE = "9e1d2c3b-4a5f-4e6d-8c7b-0a1b2c3d4e5f";
const ORIGIN = "https://learnursing.app";
const CONFIG: StripeConfig = {
  secretKey: "sk_test_fake",
  webhookSecret: "whsec_fake",
  priceLookupKey: "learn_monthly_v1",
  livemode: false,
};
const FOUNDER: BillingCaller = { userId: PROFILE, email: "founder@school.test", orgId: ORG };

function row(overrides: Partial<WorkspaceBillingRow> = {}): WorkspaceBillingRow {
  return {
    org_id: ORG,
    stripe_customer_id: CUSTOMER,
    stripe_subscription_id: null,
    status: null,
    price_lookup_key: null,
    current_period_end: null,
    trial_end: null,
    cancel_at_period_end: false,
    billing_email: "founder@school.test",
    livemode: false,
    ...overrides,
  };
}

function setup(
  options: {
    rows?: WorkspaceBillingRow[];
    subscriptions?: Stripe.Subscription[];
    founder?: string | null;
    allow?: BillingAllowance;
    config?: StripeConfig | null;
    prices?: { id: string }[];
    session?: Partial<Stripe.Checkout.Session>;
    open?: string[];
  } = {},
) {
  const state = {
    customer: customer() as Stripe.Customer | Stripe.DeletedCustomer,
    subscriptions: options.subscriptions ?? [],
  };
  const reader = fakeStripe(state);
  const db = fakeStore(options.rows ?? []);
  const created: { params: Stripe.CustomerCreateParams; key?: string }[] = [];
  const byKey = new Map<string, Stripe.Customer>();
  const checkouts: Stripe.Checkout.SessionCreateParams[] = [];
  const portals: Stripe.BillingPortal.SessionCreateParams[] = [];
  const retrieved: string[] = [];
  /** Checkout Sessions Stripe still holds open for the customer, oldest first. */
  const open: string[] = [...(options.open ?? [])];
  const expired: string[] = [];

  const stripe: StripeBilling = {
    ...reader.reader,
    customers: {
      ...reader.reader.customers,
      create: vi.fn(async (params: Stripe.CustomerCreateParams, opts?: Stripe.RequestOptions) => {
        created.push({ params, key: opts?.idempotencyKey });
        const key = opts?.idempotencyKey ?? `none-${created.length}`;
        // Stripe answers a repeated idempotency key with the first answer.
        const made =
          byKey.get(key) ??
          customer({
            id: created.length === 1 ? CUSTOMER : `cus_Extra${created.length}`,
            email: params.email ?? null,
            metadata: params.metadata as Stripe.Metadata,
          });
        byKey.set(key, made);
        state.customer = made;
        return made;
      }),
    },
    prices: {
      list: vi.fn(async () => ({
        data: (options.prices ?? [{ id: "price_Test01" }]) as Stripe.Price[],
      })),
    },
    checkout: {
      sessions: {
        create: vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => {
          checkouts.push(params);
          open.push(`cs_test_${checkouts.length}`);
          return {
            id: "cs_test_1",
            url: "https://checkout.stripe.test/c/pay/cs_test_1",
          } as Stripe.Checkout.Session;
        }),
        list: vi.fn(async (params: Stripe.Checkout.SessionListParams) => ({
          data:
            params.customer === CUSTOMER && params.status === "open"
              ? open.map((id) => ({ id, status: "open" }) as Stripe.Checkout.Session)
              : [],
        })),
        expire: vi.fn(async (id: string) => {
          const at = open.indexOf(id);
          if (at === -1)
            throw Object.assign(new Error("not open"), { type: "StripeInvalidRequestError" });
          open.splice(at, 1);
          expired.push(id);
          return { id, status: "expired" } as Stripe.Checkout.Session;
        }),
        retrieve: vi.fn(async (id: string) => {
          retrieved.push(id);
          return {
            id,
            client_reference_id: ORG,
            customer: CUSTOMER,
            status: "complete",
            ...options.session,
          } as Stripe.Checkout.Session;
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn(async (params: Stripe.BillingPortal.SessionCreateParams) => {
          portals.push(params);
          return { url: "https://billing.stripe.test/p/session/1" } as Stripe.BillingPortal.Session;
        }),
      },
    },
  };

  const log = vi.fn();
  const allow = vi.fn(async () => options.allow ?? "ok");
  const deps: BillingDeps = {
    config: options.config === undefined ? CONFIG : options.config,
    stripe: () => stripe,
    store: () => db.store,
    founderId: async () => (options.founder === undefined ? PROFILE : options.founder),
    allow,
    origin: ORIGIN,
    log,
  };
  return {
    deps,
    stripe,
    db,
    state,
    created,
    checkouts,
    portals,
    retrieved,
    open,
    expired,
    log,
    allow,
  };
}

describe("startCheckout", () => {
  it("sends the person who started the workspace to Checkout, with a trial on first use", async () => {
    const t = setup();
    expect(await startCheckout(FOUNDER, t.deps)).toEqual({
      ok: true,
      url: "https://checkout.stripe.test/c/pay/cs_test_1",
    });
    expect(t.checkouts).toEqual([
      {
        mode: "subscription",
        customer: CUSTOMER,
        client_reference_id: ORG,
        line_items: [{ price: "price_Test01", quantity: 1 }],
        payment_method_collection: "always",
        consent_collection: { terms_of_service: "required" },
        subscription_data: {
          metadata: { org_id: ORG },
          trial_period_days: 7,
          trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        },
        success_url: `${ORIGIN}/author/workspace/billing/return?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${ORIGIN}/author/workspace`,
      },
    ]);
    expect(t.checkouts[0]).not.toHaveProperty("allow_promotion_codes");
    expect(t.stripe.prices.list).toHaveBeenCalledWith({
      lookup_keys: ["learn_monthly_v1"],
      active: true,
      limit: 1,
    });
  });

  it("creates one customer, with the metadata the sync reads, and the row before Checkout", async () => {
    const t = setup();
    await startCheckout(FOUNDER, t.deps);
    expect(t.created).toEqual([
      {
        params: { email: "founder@school.test", metadata: { org_id: ORG, profile_id: PROFILE } },
        key: customerIdempotencyKey(ORG),
      },
    ]);
    expect(t.db.rows.get(ORG)).toMatchObject({ stripe_customer_id: CUSTOMER, status: null });
  });

  it("reuses the workspace's customer and never creates another", async () => {
    const t = setup({ rows: [row()] });
    await startCheckout(FOUNDER, t.deps);
    await startCheckout(FOUNDER, t.deps);
    expect(t.created).toEqual([]);
    expect(t.checkouts.map((params) => params.customer)).toEqual([CUSTOMER, CUSTOMER]);
  });

  it("closes a Checkout page left open in another tab before opening a new one", async () => {
    const t = setup({ rows: [row()], open: ["cs_test_old"] });
    expect((await startCheckout(FOUNDER, t.deps)).ok).toBe(true);
    expect(t.expired).toEqual(["cs_test_old"]);
    expect(t.stripe.checkout.sessions.list).toHaveBeenCalledWith({
      customer: CUSTOMER,
      status: "open",
      limit: 100,
    });
    await startCheckout(FOUNDER, t.deps);
    // Only the newest page can still be paid.
    expect(t.expired).toEqual(["cs_test_old", "cs_test_1"]);
    expect(t.open).toEqual(["cs_test_2"]);
  });

  it("opens no new Checkout when an earlier page cannot be closed", async () => {
    const t = setup({ rows: [row()], open: ["cs_test_old"] });
    t.stripe.checkout.sessions.expire = async () => {
      throw Object.assign(new Error("This session is not open"), {
        type: "StripeInvalidRequestError",
      });
    };
    expect(await startCheckout(FOUNDER, t.deps)).toEqual({ ok: false, reason: "failed" });
    expect(t.checkouts).toEqual([]);
    expect(t.log).toHaveBeenCalledWith("checkout failed while closing earlier Checkout pages", {
      org: ORG,
      error: "StripeInvalidRequestError",
      code: undefined,
    });
  });

  it("a double press before the row exists makes one customer (the idempotency key)", async () => {
    const t = setup();
    // The second press does not see the first's row: the row write is held back.
    const upsert = t.db.store.upsert;
    t.db.store.upsert = async () => {};
    await Promise.all([startCheckout(FOUNDER, t.deps), startCheckout(FOUNDER, t.deps)]);
    t.db.store.upsert = upsert;
    expect(new Set(t.created.map((call) => call.key))).toEqual(
      new Set([customerIdempotencyKey(ORG)]),
    );
    expect(new Set(t.checkouts.map((params) => params.customer))).toEqual(new Set([CUSTOMER]));
  });

  it("asks for no trial when this person had one in another workspace", async () => {
    const t = setup();
    t.db.trials.push({ profile: PROFILE, org: OTHER_ORG, subscription: "sub_Old" });
    expect((await startCheckout(FOUNDER, t.deps)).ok).toBe(true);
    expect(t.checkouts[0]?.subscription_data).toEqual({ metadata: { org_id: ORG } });
  });

  it("asks for no trial when this workspace had one, under anyone", async () => {
    const t = setup();
    t.db.trials.push({ profile: COLLEAGUE, org: ORG, subscription: "sub_Old" });
    expect((await startCheckout(FOUNDER, t.deps)).ok).toBe(true);
    expect(t.checkouts[0]?.subscription_data).not.toHaveProperty("trial_period_days");
    expect(t.checkouts[0]?.subscription_data).not.toHaveProperty("trial_settings");
  });

  it("refuses a teacher who did not start the workspace, before any Stripe call", async () => {
    for (const founder of [COLLEAGUE, null]) {
      const t = setup({ founder });
      expect(await startCheckout(FOUNDER, t.deps)).toEqual({ ok: false, reason: "not_founder" });
      expect(t.created).toEqual([]);
      expect(t.checkouts).toEqual([]);
      expect(t.stripe.prices.list).not.toHaveBeenCalled();
    }
  });

  it("refuses a workspace already on a subscription, by its row", async () => {
    for (const status of ["trialing", "active", "past_due"] as const) {
      const t = setup({ rows: [row({ status, stripe_subscription_id: "sub_Test01" })] });
      expect(await startCheckout(FOUNDER, t.deps)).toEqual({
        ok: false,
        reason: "already_subscribed",
      });
      expect(t.checkouts).toEqual([]);
    }
  });

  it("refuses when Stripe has a subscription the row does not show yet", async () => {
    const t = setup({ rows: [row()], subscriptions: [subscription({ status: "active" })] });
    expect(await startCheckout(FOUNDER, t.deps)).toEqual({
      ok: false,
      reason: "already_subscribed",
    });
    expect(t.checkouts).toEqual([]);
  });

  it("lets a workspace whose subscription ended subscribe again, without a trial", async () => {
    const t = setup({
      rows: [row({ status: "canceled" })],
      subscriptions: [subscription({ status: "canceled" })],
    });
    t.db.trials.push({ profile: PROFILE, org: ORG, subscription: "sub_Test01" });
    expect((await startCheckout(FOUNDER, t.deps)).ok).toBe(true);
    expect(t.checkouts[0]?.subscription_data).toEqual({ metadata: { org_id: ORG } });
  });

  it("opens nothing without Stripe set up, or over the rate limit", async () => {
    const off = setup({ config: null });
    expect(await startCheckout(FOUNDER, off.deps)).toEqual({
      ok: false,
      reason: "not_configured",
    });
    expect(off.allow).not.toHaveBeenCalled();

    const limited = setup({ allow: "rate_limited" });
    expect(await startCheckout(FOUNDER, limited.deps)).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    const down = setup({ allow: "unavailable" });
    expect(await startCheckout(FOUNDER, down.deps)).toEqual({ ok: false, reason: "failed" });
    expect([...limited.checkouts, ...down.checkouts]).toEqual([]);
  });

  it("fails plainly when no price has the lookup key", async () => {
    const t = setup({ prices: [] });
    expect(await startCheckout(FOUNDER, t.deps)).toEqual({ ok: false, reason: "failed" });
    expect(t.log).toHaveBeenCalledWith("checkout refused: no active price has the lookup key", {
      lookupKey: "learn_monthly_v1",
    });
  });

  it("refuses a customer that belongs to another workspace", async () => {
    const t = setup({ rows: [row()] });
    t.state.customer = customer({ metadata: { org_id: OTHER_ORG, profile_id: PROFILE } });
    expect(await startCheckout(FOUNDER, t.deps)).toEqual({ ok: false, reason: "failed" });
    expect(t.checkouts).toEqual([]);
  });

  it("logs the failing step and the error's type, never its message or a Stripe id", async () => {
    const t = setup({ rows: [row()] });
    t.stripe.checkout.sessions.create = async () => {
      throw Object.assign(new Error(`No such customer: '${CUSTOMER}'`), {
        type: "StripeInvalidRequestError",
        code: "resource_missing",
      });
    };
    expect(await startCheckout(FOUNDER, t.deps)).toEqual({ ok: false, reason: "failed" });
    expect(t.log).toHaveBeenCalledWith("checkout failed while creating the Checkout Session", {
      org: ORG,
      error: "StripeInvalidRequestError",
      code: "resource_missing",
    });
    expect(JSON.stringify(t.log.mock.calls)).not.toContain(CUSTOMER);
  });

  it("fails plainly when Checkout gives back no URL", async () => {
    const t = setup({ rows: [row()] });
    t.stripe.checkout.sessions.create = async () =>
      ({ id: "cs_test_2", url: null }) as Stripe.Checkout.Session;
    expect(await startCheckout(FOUNDER, t.deps)).toEqual({ ok: false, reason: "failed" });
  });

  it("leaves out the email when the account has none", async () => {
    const t = setup();
    await startCheckout({ ...FOUNDER, email: "" }, t.deps);
    expect(t.created[0]?.params).toEqual({ metadata: { org_id: ORG, profile_id: PROFILE } });
  });
});

describe("checkoutParams", () => {
  it("carries the trial only when asked", () => {
    const base = { customerId: CUSTOMER, orgId: ORG, priceId: "price_1", origin: ORIGIN };
    expect(checkoutParams({ ...base, trial: true }).subscription_data?.trial_period_days).toBe(7);
    expect(checkoutParams({ ...base, trial: false }).subscription_data).toEqual({
      metadata: { org_id: ORG },
    });
  });
});

describe("openPortal", () => {
  it("opens the portal on the workspace's customer, back to the workspace page", async () => {
    const t = setup({ rows: [row({ status: "active" })] });
    expect(await openPortal(FOUNDER, t.deps)).toEqual({
      ok: true,
      url: "https://billing.stripe.test/p/session/1",
    });
    expect(t.portals).toEqual([{ customer: CUSTOMER, return_url: `${ORIGIN}/author/workspace` }]);
  });

  it("refuses a teacher who did not start the workspace", async () => {
    const t = setup({ rows: [row({ status: "active" })] });
    expect(await openPortal({ ...FOUNDER, userId: COLLEAGUE }, t.deps)).toEqual({
      ok: false,
      reason: "not_founder",
    });
    expect(t.portals).toEqual([]);
  });

  it("refuses a workspace with no customer, and without Stripe set up", async () => {
    expect(await openPortal(FOUNDER, setup().deps)).toEqual({ ok: false, reason: "no_customer" });
    expect(await openPortal(FOUNDER, setup({ config: null }).deps)).toEqual({
      ok: false,
      reason: "not_configured",
    });
  });

  it("counts against the rate limit and fails plainly when Stripe does", async () => {
    expect(await openPortal(FOUNDER, setup({ allow: "rate_limited" }).deps)).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    const t = setup({ rows: [row()] });
    t.stripe.billingPortal.sessions.create = async () => {
      throw new Error("down");
    };
    expect(await openPortal(FOUNDER, t.deps)).toEqual({ ok: false, reason: "failed" });
    expect(t.log).toHaveBeenCalledWith("portal failed", {
      org: ORG,
      error: "Error",
      code: undefined,
    });
  });
});

describe("confirmCheckoutReturn", () => {
  it("syncs the workspace from a finished Checkout of its own", async () => {
    const t = setup({ subscriptions: [subscription()] });
    expect(await confirmCheckoutReturn("cs_test_abc123", { orgId: ORG }, t.deps)).toBe("confirmed");
    expect(t.retrieved).toEqual(["cs_test_abc123"]);
    expect(t.db.rows.get(ORG)).toMatchObject({ status: "trialing", stripe_customer_id: CUSTOMER });
  });

  it("does nothing for another workspace's Checkout", async () => {
    const t = setup({ subscriptions: [subscription()] });
    expect(await confirmCheckoutReturn("cs_test_abc123", { orgId: OTHER_ORG }, t.deps)).toBe(
      "ignored",
    );
    expect(t.db.writes).toEqual([]);
  });

  it("does nothing for a malformed id, without asking Stripe", async () => {
    const t = setup();
    for (const id of ["", "{CHECKOUT_SESSION_ID}", "cs_test_../../x", "sub_123"]) {
      expect(await confirmCheckoutReturn(id, { orgId: ORG }, t.deps)).toBe("ignored");
    }
    expect(t.retrieved).toEqual([]);
  });

  it("does nothing for an unfinished or unknown session, or without Stripe", async () => {
    const open = setup({ session: { status: "open" } });
    expect(await confirmCheckoutReturn("cs_test_1", { orgId: ORG }, open.deps)).toBe("ignored");
    const unknown = setup();
    unknown.stripe.checkout.sessions.retrieve = async () => {
      throw Object.assign(new Error("No such checkout.session"), {
        type: "StripeInvalidRequestError",
      });
    };
    expect(await confirmCheckoutReturn("cs_test_1", { orgId: ORG }, unknown.deps)).toBe("ignored");
    expect(
      await confirmCheckoutReturn("cs_test_1", { orgId: ORG }, setup({ config: null }).deps),
    ).toBe("ignored");
    expect(unknown.db.writes).toEqual([]);
  });

  it("does nothing when the session's customer belongs to another workspace", async () => {
    const t = setup();
    t.state.customer = customer({ metadata: { org_id: OTHER_ORG, profile_id: PROFILE } });
    expect(await confirmCheckoutReturn("cs_test_1", { orgId: ORG }, t.deps)).toBe("ignored");
  });

  it("names the query the workspace page thanks the teacher for", () => {
    expect(BILLING_CONFIRMED_QUERY).toBe("billing=started");
  });
});

describe("trialOnOffer", () => {
  it("is may_start_trial's answer, and false without Stripe or an answer", async () => {
    expect(await trialOnOffer(FOUNDER, setup().deps)).toBe(true);
    const used = setup();
    used.db.trials.push({ profile: PROFILE, org: OTHER_ORG, subscription: "sub_Old" });
    expect(await trialOnOffer(FOUNDER, used.deps)).toBe(false);
    expect(await trialOnOffer(FOUNDER, setup({ config: null }).deps)).toBe(false);
    const down = setup();
    down.db.store.mayStartTrial = async () => {
      throw new Error("may_start_trial failed");
    };
    expect(await trialOnOffer(FOUNDER, down.deps)).toBe(false);
    expect(down.log).toHaveBeenCalled();
  });
});
