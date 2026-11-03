import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalSiteOrigin, type RequestHeaders } from "@/lib/http/siteOrigin";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { readFounderId } from "@/lib/supabase/workspace";
import { supabaseBillingStore } from "./billingStore";
import type { BillingDeps } from "./checkout";
import { takeBillingSession } from "./sessionLimit";
import { createStripeClient, stripeConfigFromEnv } from "./stripe";

/**
 * The real dependencies of the Billing section (#519): the one Stripe client (`stripe.ts`), the
 * sync's service-role store, the founder read as the signed-in teacher, the shared rate limiter,
 * and the canonical origin (`SITE_URL` in production), never one the request names. Nothing is
 * built until a step needs it, and nothing at all without a Stripe config.
 */
/**
 * The part a page needs: the config, the store and the log, for `trialOnOffer` and
 * `confirmCheckoutReturn`. No rate limit and no founder read: neither opens anything.
 */
export function billingReadDeps(): Pick<BillingDeps, "config" | "stripe" | "store" | "log"> {
  const config = stripeConfigFromEnv();
  return {
    config,
    stripe: () => {
      if (!config) throw new Error("billing is not configured");
      return createStripeClient(config);
    },
    store: () => supabaseBillingStore(createSupabaseServiceClient()),
    log,
  };
}

const log: BillingDeps["log"] = (message, details) => console.warn(`[billing] ${message}`, details);

export function billingDeps(input: {
  supabase: SupabaseClient<Database>;
  orgId: string;
  userId: string;
  requestHeaders: RequestHeaders;
}): BillingDeps {
  return {
    ...billingReadDeps(),
    founderId: () => readFounderId(input.supabase, input.orgId),
    allow: () => takeBillingSession(input.userId),
    origin: canonicalSiteOrigin(input.requestHeaders),
  };
}
