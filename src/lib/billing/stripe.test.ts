import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { STRIPE_API_VERSION, createStripeClient, stripeConfigFromEnv } from "./stripe";

describe("createStripeClient", () => {
  it("pins the API version the sync was written against", () => {
    // Constructing a client makes no request.
    const client = createStripeClient({ secretKey: "sk_test_fake" });
    expect(client).toBeInstanceOf(Stripe);
    expect(client.getApiField("version")).toBe(STRIPE_API_VERSION);
    expect(STRIPE_API_VERSION).toBe("2026-09-30.endive");
  });
});

describe("stripeConfigFromEnv", () => {
  it("is null without keys and with a live key outside production", () => {
    expect(stripeConfigFromEnv({})).toBeNull();
    expect(
      stripeConfigFromEnv({ STRIPE_SECRET_KEY: "sk_live_fake", STRIPE_WEBHOOK_SECRET: "whsec_x" }),
    ).toBeNull();
    expect(
      stripeConfigFromEnv({ STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_x" }),
    ).toMatchObject({ livemode: false });
  });
});
