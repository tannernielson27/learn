import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BILLING_REFUSAL_MESSAGES } from "@/lib/billing/billingCopy";
import { CUSTOMER, customer, fakeStore, subscription } from "@/lib/billing/testing/fakes";

/**
 * The Billing section's Server Functions and the Checkout return page, with the real author check,
 * the real founder read and the real Checkout steps. Faked: the Supabase clients, Stripe, the
 * rate limiter and Next. What is pinned is that the server, not the button, decides: a teacher
 * who did not start the workspace gets a sentence and Stripe is never called, and a return for
 * another workspace's Checkout changes nothing.
 */

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "learn.example", "x-forwarded-proto": "https" }),
}));

const USER = "00000000-0000-4000-8000-0000000000a1";
const COLLEAGUE = "00000000-0000-4000-8000-0000000000b2";
const ORG = "0b9f3c1e-7a52-4d0c-9a51-2f6c1d8e4b10";
const OTHER_ORG = "5d7e2a90-1c3b-4f8e-b6a2-9e0d4c7f1a23";

type Reply = { data?: unknown; error?: { code?: string } | null };

let claims: Record<string, unknown> | null;
let founderId: string | null;

function builderFor(table: string) {
  const builder: Record<string, unknown> = {};
  for (const step of ["select", "eq", "is", "order", "limit"]) builder[step] = () => builder;
  builder.maybeSingle = async (): Promise<Reply> =>
    table === "profiles"
      ? { data: { org_id: ORG, role: "instructor" }, error: null }
      : table === "orgs"
        ? { data: { founder_id: founderId }, error: null }
        : { data: null, error: null };
  return builder;
}

const userClient = {
  auth: {
    getClaims: async () => ({ data: claims ? { claims } : null }),
    getUser: async () => ({
      data: { user: claims ? { id: claims.sub, email: claims.email } : null },
      error: null,
    }),
  },
  from: vi.fn((table: string) => builderFor(table)),
  rpc: vi.fn(),
};
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => userClient }));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({}) }));

let db = fakeStore();
vi.mock("@/lib/billing/billingStore", () => ({ supabaseBillingStore: () => db.store }));
vi.mock("@/lib/billing/sessionLimit", () => ({ takeBillingSession: async () => "ok" }));

const stripeState = {
  customer: customer({ metadata: { org_id: ORG, profile_id: USER } }) as Stripe.Customer,
  subscriptions: [] as Stripe.Subscription[],
  sessionOrg: ORG as string | null,
};
const stripe = {
  customers: {
    retrieve: vi.fn(async () => stripeState.customer),
    create: vi.fn(async () => stripeState.customer),
  },
  subscriptions: { list: vi.fn(async () => ({ data: stripeState.subscriptions })) },
  prices: { list: vi.fn(async () => ({ data: [{ id: "price_Test01" }] })) },
  checkout: {
    sessions: {
      create: vi.fn(async () => ({ url: "https://checkout.stripe.test/c/pay/cs_test_1" })),
      list: vi.fn(async () => ({ data: [] })),
      expire: vi.fn(async (id: string) => ({ id, status: "expired" })),
      retrieve: vi.fn(async (id: string) => ({
        id,
        client_reference_id: stripeState.sessionOrg,
        customer: CUSTOMER,
        status: "complete",
      })),
    },
  },
  billingPortal: {
    sessions: { create: vi.fn(async () => ({ url: "https://billing.stripe.test/p/1" })) },
  },
};
vi.mock("@/lib/billing/stripe", async (original) => ({
  ...(await original<typeof import("@/lib/billing/stripe")>()),
  createStripeClient: () => stripe,
}));

const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

const { openPortalAction, startCheckoutAction } = await import("./billingActions");
const { default: BillingReturnPage } = await import("./billing/return/page");

const returnTo = (sessionId?: string) =>
  BillingReturnPage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve(sessionId === undefined ? {} : { session_id: sessionId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_fake");
  claims = { sub: USER, email: "ada@school.edu" };
  founderId = USER;
  db = fakeStore();
  stripeState.subscriptions = [];
  stripeState.sessionOrg = ORG;
});

describe("startCheckoutAction", () => {
  it("sends the person who started the workspace to Stripe's Checkout", async () => {
    await expect(startCheckoutAction()).rejects.toThrow(
      "redirect:https://checkout.stripe.test/c/pay/cs_test_1",
    );
    expect(stripe.customers.create).toHaveBeenCalledWith(
      { email: "ada@school.edu", metadata: { org_id: ORG, profile_id: USER } },
      { idempotencyKey: `learn-workspace-customer-${ORG}` },
    );
    // The origin is the deployment's, off Vercel the request's: never a hard-coded domain.
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        client_reference_id: ORG,
        cancel_url: "https://learn.example/author/workspace",
      }),
    );
  });

  it("refuses a colleague on the server, and never calls Stripe", async () => {
    claims = { sub: COLLEAGUE, email: "mary@school.edu" };
    expect(await startCheckoutAction()).toEqual({
      status: "error",
      error: BILLING_REFUSAL_MESSAGES.not_founder,
    });
    expect(stripe.customers.create).not.toHaveBeenCalled();
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refuses a workspace already subscribed and sends them to Manage billing", async () => {
    stripeState.subscriptions = [subscription({ status: "active" })];
    expect(await startCheckoutAction()).toEqual({
      status: "error",
      error: BILLING_REFUSAL_MESSAGES.already_subscribed,
    });
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("says billing is not available without Stripe set up", async () => {
    vi.unstubAllEnvs();
    expect(await startCheckoutAction()).toEqual({
      status: "error",
      error: BILLING_REFUSAL_MESSAGES.not_configured,
    });
  });

  it("sends a signed-out visitor to sign in", async () => {
    claims = null;
    await expect(startCheckoutAction()).rejects.toThrow(/^redirect:\/sign-in/);
  });
});

describe("openPortalAction", () => {
  it("opens the portal for the person who started the workspace", async () => {
    await expect(startCheckoutAction()).rejects.toThrow(/redirect:/);
    await expect(openPortalAction()).rejects.toThrow("redirect:https://billing.stripe.test/p/1");
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: CUSTOMER,
      return_url: "https://learn.example/author/workspace",
    });
  });

  it("refuses a colleague on the server", async () => {
    await expect(startCheckoutAction()).rejects.toThrow(/redirect:/);
    claims = { sub: COLLEAGUE, email: "mary@school.edu" };
    expect(await openPortalAction()).toEqual({
      status: "error",
      error: BILLING_REFUSAL_MESSAGES.not_founder,
    });
    expect(stripe.billingPortal.sessions.create).not.toHaveBeenCalled();
  });
});

describe("the Checkout return page", () => {
  it("syncs a finished Checkout of the caller's workspace and thanks them", async () => {
    stripeState.subscriptions = [subscription()];
    await expect(returnTo("cs_test_abc")).rejects.toThrow(
      "redirect:/author/workspace?billing=started",
    );
    expect(db.rows.get(ORG)).toMatchObject({ status: "trialing" });
  });

  it("changes nothing for another workspace's Checkout, or no id", async () => {
    stripeState.sessionOrg = OTHER_ORG;
    await expect(returnTo("cs_test_abc")).rejects.toThrow(/^redirect:\/author\/workspace$/);
    await expect(returnTo()).rejects.toThrow(/^redirect:\/author\/workspace$/);
    expect(db.writes).toEqual([]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(CUSTOMER);
  });
});
