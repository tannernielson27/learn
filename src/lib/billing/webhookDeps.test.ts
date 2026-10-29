import Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseServiceClient = vi.fn(() => "service-client");
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient }));
const syncWorkspaceBilling = vi.fn(async () => ({ kind: "no_workspace" }));
vi.mock("./sync", () => ({ syncWorkspaceBilling }));
const claimStripeEvent = vi.fn(async () => true);
const supabaseBillingStore = vi.fn(() => "store");
vi.mock("./billingStore", () => ({ claimStripeEvent, supabaseBillingStore }));

const { stripeWebhookDeps } = await import("./webhookDeps");

const SECRET = "whsec_unit_test_only";

describe("stripeWebhookDeps", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("VERCEL_ENV", "preview");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("has no config, and builds nothing, without keys", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(stripeWebhookDeps().config).toBeNull();
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("refuses a live key on a preview", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_fake");
    expect(stripeWebhookDeps().config).toBeNull();
  });

  it("verifies with the library's own check, before any client exists", () => {
    const deps = stripeWebhookDeps();
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid" });
    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
    expect(deps.constructEvent(payload, header, SECRET).id).toBe("evt_1");
    expect(() => deps.constructEvent(payload, header, "whsec_other")).toThrow();
    expect(createSupabaseServiceClient).not.toHaveBeenCalled();
  });

  it("syncs with a Stripe client and the service-role store, and claims through it", async () => {
    const deps = stripeWebhookDeps();
    await deps.sync("cus_1");
    const [customerId, syncDeps] = syncWorkspaceBilling.mock.calls[0] as unknown as [
      string,
      { stripe: unknown; store: unknown; log: (m: string, d: object) => void },
    ];
    expect(customerId).toBe("cus_1");
    expect(syncDeps.stripe).toBeInstanceOf(Stripe);
    expect(syncDeps.store).toBe("store");
    expect(supabaseBillingStore).toHaveBeenCalledWith("service-client");

    await deps.claim({ id: "evt_1", type: "invoice.paid", livemode: false });
    expect(claimStripeEvent).toHaveBeenCalledWith("service-client", {
      id: "evt_1",
      type: "invoice.paid",
      livemode: false,
    });
    expect(createSupabaseServiceClient).toHaveBeenCalledTimes(1);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    syncDeps.log("customer has no org_id in its metadata", { customer: "cus_1" });
    expect(warn).toHaveBeenCalledWith("[stripe-webhook] customer has no org_id in its metadata", {
      customer: "cus_1",
    });
    warn.mockRestore();
  });

  it("will not sync without a config", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    await expect(stripeWebhookDeps().sync("cus_1")).rejects.toThrow("not configured");
  });

  it("logs at the level asked", () => {
    const spies = {
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
    };
    const { log } = stripeWebhookDeps();
    for (const level of ["error", "warn", "info"] as const) {
      log(level, "m", { event: "evt_1" });
      expect(spies[level]).toHaveBeenCalledWith("[stripe-webhook] m", { event: "evt_1" });
      spies[level].mockRestore();
    }
  });
});
