import Stripe from "stripe";
import { readStripeConfig, type StripeConfig, type StripeEnv } from "./stripeConfig";

/**
 * The API version every call is made at (ADR 0016). Pinned, so a Stripe account's default
 * version, or a library upgrade, never changes the shape of what the sync reads. A webhook
 * endpoint in the dashboard must be created at the same version (docs/05 §7.15 step 6).
 */
export const STRIPE_API_VERSION = "2026-09-30.endive" as const;

/**
 * A Stripe client for the server. Never call it from anything a browser loads: the key has no
 * NEXT_PUBLIC_ name, so Next replaces it with undefined in a client bundle, and `readStripeConfig`
 * refuses to run without it.
 */
export function createStripeClient(config: Pick<StripeConfig, "secretKey">): Stripe {
  return new Stripe(config.secretKey, {
    apiVersion: STRIPE_API_VERSION,
    // Retries are idempotent for GETs; the sync makes only GETs.
    maxNetworkRetries: 2,
    timeout: 10_000,
    appInfo: { name: "LeaRN" },
  });
}

/** The configuration from this process's environment, read once per call. */
export function stripeConfigFromEnv(env: StripeEnv = process.env): StripeConfig | null {
  return readStripeConfig(env).config;
}
