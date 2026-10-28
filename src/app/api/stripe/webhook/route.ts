import { handleStripeWebhook } from "@/lib/billing/webhook";
import { stripeWebhookDeps } from "@/lib/billing/webhookDeps";

/**
 * Stripe's webhook (#518, ADR 0016). POST only; any other method gets Next's 405. Outside
 * `src/proxy.ts`'s matcher on purpose: Stripe has no session to refresh, and the proxy must never
 * redirect it. Vercel's deployment protection must not cover it either (docs/05 §7.15 step 6).
 * See `handleStripeWebhook`.
 */
export async function POST(request: Request): Promise<Response> {
  return handleStripeWebhook(request, stripeWebhookDeps());
}
