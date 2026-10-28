/**
 * How the Stripe variables stand on this deployment (#518, ADR 0016 "Sandbox and live").
 *
 * Pure: it reads only the environment object it is handed, so `/api/health`, the webhook and the
 * tests all judge the same values the same way. It never returns a key except inside `config`,
 * and only when billing may run.
 *
 * - `off`: neither `STRIPE_SECRET_KEY` nor `STRIPE_WEBHOOK_SECRET` is set. Billing is a no-op and
 *   the webhook answers 503. This is CI, local runs without a sandbox, and every Preview until the
 *   production split (docs/05 §7.15).
 * - `incomplete`: one of the two without the other. Billing cannot run; the webhook answers 503.
 * - `misconfigured`: a key that is not a Stripe secret or restricted key (a publishable key, a
 *   typo), a webhook secret that is not `whsec_`, or either one under a `NEXT_PUBLIC_` name, where
 *   Next would inline it into the browser bundle.
 * - `live_refused`: a live key (`sk_live_`, `rk_live_`) anywhere but `VERCEL_ENV=production`.
 *   Until the production split a preview writes to production's database, so a live key there is
 *   refused outright rather than trusted to be used carefully.
 * - `test` / `live`: both are set and usable; `config` carries them.
 */

export const STRIPE_SETUP_STATES = [
  "off",
  "incomplete",
  "misconfigured",
  "live_refused",
  "test",
  "live",
] as const;

export type StripeSetup = (typeof STRIPE_SETUP_STATES)[number];

/** The price every Checkout uses unless `STRIPE_PRICE_LOOKUP_KEY` names another (ADR 0016). */
export const DEFAULT_PRICE_LOOKUP_KEY = "learn_monthly_v1";

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  priceLookupKey: string;
  /** True for a live key. Every row the webhook writes carries Stripe's own livemode as well. */
  livemode: boolean;
}

export interface StripeReading {
  setup: StripeSetup;
  /** Non-null only for `test` and `live`. */
  config: StripeConfig | null;
}

export type StripeEnv = Readonly<Record<string, string | undefined>>;

const TEST_KEY = /^(sk|rk)_test_[A-Za-z0-9_]+$/;
const LIVE_KEY = /^(sk|rk)_live_[A-Za-z0-9_]+$/;
const WEBHOOK_SECRET = /^whsec_[A-Za-z0-9_+/=]+$/;
/** A lookup key as the catalog script makes them: lower case, digits and underscores. */
const LOOKUP_KEY = /^[a-z0-9_]{1,200}$/;

export type KeyMode = "test" | "live" | "invalid";

/** Which mode a secret or restricted key belongs to, from its prefix alone. */
export function stripeKeyMode(key: string): KeyMode {
  if (TEST_KEY.test(key)) return "test";
  if (LIVE_KEY.test(key)) return "live";
  return "invalid";
}

function trimmed(value: string | undefined): string {
  return (value ?? "").trim();
}

export function readStripeConfig(env: StripeEnv): StripeReading {
  const secretKey = trimmed(env.STRIPE_SECRET_KEY);
  const webhookSecret = trimmed(env.STRIPE_WEBHOOK_SECRET);
  const lookup = trimmed(env.STRIPE_PRICE_LOOKUP_KEY) || DEFAULT_PRICE_LOOKUP_KEY;
  const exposed =
    trimmed(env.NEXT_PUBLIC_STRIPE_SECRET_KEY) !== "" ||
    trimmed(env.NEXT_PUBLIC_STRIPE_WEBHOOK_SECRET) !== "";

  const refuse = (setup: StripeSetup): StripeReading => ({ setup, config: null });
  if (exposed) return refuse("misconfigured");
  if (!secretKey && !webhookSecret) return refuse("off");

  const mode = secretKey ? stripeKeyMode(secretKey) : null;
  if (mode === "invalid") return refuse("misconfigured");
  if (webhookSecret && !WEBHOOK_SECRET.test(webhookSecret)) return refuse("misconfigured");
  if (!LOOKUP_KEY.test(lookup)) return refuse("misconfigured");
  // Before `incomplete`: a live key outside production is the louder problem.
  if (mode === "live" && env.VERCEL_ENV !== "production") return refuse("live_refused");
  if (!secretKey || !webhookSecret) return refuse("incomplete");

  const livemode = mode === "live";
  return {
    setup: livemode ? "live" : "test",
    config: { secretKey, webhookSecret, priceLookupKey: lookup, livemode },
  };
}
