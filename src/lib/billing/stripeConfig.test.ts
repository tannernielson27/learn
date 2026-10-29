import { describe, expect, it } from "vitest";
import { DEFAULT_PRICE_LOOKUP_KEY, readStripeConfig, stripeKeyMode } from "./stripeConfig";

// Shapes only, and kept short so no secret scanner mistakes them for real keys.
const TEST_KEY = "sk_test_fake";
const LIVE_KEY = "sk_live_fake";
const RESTRICTED_LIVE = "rk_live_fake";
const WHSEC = "whsec_fake";

describe("stripeKeyMode", () => {
  it("reads the mode from the prefix", () => {
    expect(stripeKeyMode(TEST_KEY)).toBe("test");
    expect(stripeKeyMode("rk_test_abc")).toBe("test");
    expect(stripeKeyMode(LIVE_KEY)).toBe("live");
    expect(stripeKeyMode(RESTRICTED_LIVE)).toBe("live");
    expect(stripeKeyMode("pk_test_abc")).toBe("invalid");
    expect(stripeKeyMode("sk_test_")).toBe("invalid");
    expect(stripeKeyMode("")).toBe("invalid");
  });
});

describe("readStripeConfig", () => {
  it("is off with neither variable, so CI and previews without keys build and pass", () => {
    expect(readStripeConfig({})).toEqual({ setup: "off", config: null });
    expect(readStripeConfig({ STRIPE_SECRET_KEY: " ", STRIPE_WEBHOOK_SECRET: "" })).toEqual({
      setup: "off",
      config: null,
    });
  });

  it("is incomplete with one of the two", () => {
    expect(readStripeConfig({ STRIPE_SECRET_KEY: TEST_KEY }).setup).toBe("incomplete");
    expect(readStripeConfig({ STRIPE_WEBHOOK_SECRET: WHSEC }).setup).toBe("incomplete");
  });

  it("runs with a test key anywhere, defaulting the lookup key", () => {
    for (const VERCEL_ENV of [undefined, "preview", "production"]) {
      const reading = readStripeConfig({
        STRIPE_SECRET_KEY: ` ${TEST_KEY} `,
        STRIPE_WEBHOOK_SECRET: WHSEC,
        VERCEL_ENV,
      });
      expect(reading).toEqual({
        setup: "test",
        config: {
          secretKey: TEST_KEY,
          webhookSecret: WHSEC,
          priceLookupKey: DEFAULT_PRICE_LOOKUP_KEY,
          livemode: false,
        },
      });
    }
  });

  it("refuses a live key outside production, and runs it in production", () => {
    for (const key of [LIVE_KEY, RESTRICTED_LIVE]) {
      for (const VERCEL_ENV of [undefined, "", "preview", "development", "Production"]) {
        const env = { STRIPE_SECRET_KEY: key, STRIPE_WEBHOOK_SECRET: WHSEC, VERCEL_ENV };
        expect(readStripeConfig(env)).toEqual({ setup: "live_refused", config: null });
      }
      // Refused even without the webhook secret: the louder problem wins.
      expect(readStripeConfig({ STRIPE_SECRET_KEY: key }).setup).toBe("live_refused");
      const reading = readStripeConfig({
        STRIPE_SECRET_KEY: key,
        STRIPE_WEBHOOK_SECRET: WHSEC,
        STRIPE_PRICE_LOOKUP_KEY: "learn_monthly_v2",
        VERCEL_ENV: "production",
      });
      expect(reading.setup).toBe("live");
      expect(reading.config).toMatchObject({ livemode: true, priceLookupKey: "learn_monthly_v2" });
    }
  });

  it("calls a value of the wrong shape misconfigured", () => {
    const base = { STRIPE_SECRET_KEY: TEST_KEY, STRIPE_WEBHOOK_SECRET: WHSEC };
    for (const env of [
      { ...base, STRIPE_SECRET_KEY: "pk_test_publishable" },
      { ...base, STRIPE_WEBHOOK_SECRET: "not-a-whsec" },
      { ...base, STRIPE_PRICE_LOOKUP_KEY: "Learn Monthly" },
      { ...base, NEXT_PUBLIC_STRIPE_SECRET_KEY: TEST_KEY },
      { NEXT_PUBLIC_STRIPE_WEBHOOK_SECRET: WHSEC },
    ]) {
      expect(readStripeConfig(env)).toEqual({ setup: "misconfigured", config: null });
    }
  });
});
