import Stripe from "stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { claimStripeEvent, supabaseBillingStore } from "./billingStore";
import { createStripeClient, stripeConfigFromEnv } from "./stripe";
import { syncWorkspaceBilling } from "./sync";
import type { WebhookDeps, WebhookLog } from "./webhook";

const log: WebhookLog = (level, message, details) => {
  const line = `[stripe-webhook] ${message}`;
  if (level === "error") console.error(line, details);
  else if (level === "warn") console.warn(line, details);
  else console.info(line, details);
};

/**
 * The real dependencies of the webhook route. Nothing is built until it is needed: with billing
 * off there is no Stripe client and no service client at all, and neither is made before the
 * signature has been checked (`Stripe.webhooks.constructEvent` is the library's static, keyless
 * verifier).
 */
export function stripeWebhookDeps(): WebhookDeps {
  const config = stripeConfigFromEnv();
  let supabase: ReturnType<typeof createSupabaseServiceClient> | null = null;
  const service = () => (supabase ??= createSupabaseServiceClient());
  return {
    config,
    constructEvent: (payload, header, secret) =>
      Stripe.webhooks.constructEvent(payload, header, secret),
    sync: async (customerId) => {
      // The handler never syncs without a config; this keeps the key out of reach if it did.
      if (!config) throw new Error("billing is not configured");
      return syncWorkspaceBilling(customerId, {
        stripe: createStripeClient(config),
        store: supabaseBillingStore(service()),
        log: (message, details) => log("warn", message, details),
      });
    },
    claim: (event) => claimStripeEvent(service(), event),
    log,
  };
}
