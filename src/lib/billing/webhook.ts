/**
 * `POST /api/stripe/webhook` (#518, ADR 0016). Stripe calls it; nobody else can do anything
 * with it.
 *
 * 1. Billing off, incomplete, misconfigured or a live key outside production (`readStripeConfig`):
 *    503, before the body is read. Stripe retries later; CI and previews without keys get the
 *    same answer and nothing runs.
 * 2. The signature is checked on the raw body, exactly the bytes Stripe signed (`request.text()`,
 *    never a parsed and re-serialised body), with `STRIPE_WEBHOOK_SECRET` and the library's
 *    default 5-minute tolerance. Anything wrong: 400 `{"error":"invalid_signature"}`, the same
 *    body whatever was wrong, and the reason is not logged with the payload.
 * 3. An event type the app does not handle: 200, nothing read or written.
 * 4. Sync the event's customer (`syncWorkspaceBilling`), which re-fetches from Stripe and writes
 *    the row only when it differs.
 * 5. Only then claim the event id (`claim_stripe_event`). A duplicate answers 200 as well.
 *
 * Why claim last (Decisions in #518): the migration gives the service role an insert-or-skip
 * claim and no way to remove a claim. Claiming first and then failing the sync would leave the
 * event claimed, so Stripe's retry would be skipped as a duplicate and the update lost until some
 * later event for that customer. Claiming after a successful sync means a failed delivery is
 * retried in full, and the cost of a duplicate is one re-fetch that writes nothing, because the
 * sync compares before it writes and Stripe's state is what it was. `private.stripe_events` is
 * then the record of events processed, which is what it is for.
 *
 * The response bodies are fixed strings; no Stripe or database error reaches the caller. Logs
 * name the event id and type, the customer id and the outcome, never a key, a signature, a body
 * or an email address.
 */
import type Stripe from "stripe";
import { asCustomerId, type SyncOutcome } from "./sync";
import type { StripeConfig } from "./stripeConfig";

/** Exactly the events docs/05 §7.15 step 6 subscribes the endpoint to. */
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
] as const;

export type HandledEvent = (typeof HANDLED_EVENTS)[number];

export type WebhookLog = (
  level: "info" | "warn" | "error",
  message: string,
  details: Record<string, unknown>,
) => void;

export interface WebhookDeps {
  /** `readStripeConfig(process.env).config`: null whenever billing may not run. */
  config: StripeConfig | null;
  /** `stripe.webhooks.constructEvent`; throws on a bad signature. */
  constructEvent: (payload: string, header: string, secret: string) => Stripe.Event;
  sync: (customerId: string) => Promise<SyncOutcome>;
  claim: (event: { id: string; type: string; livemode: boolean }) => Promise<boolean>;
  log: WebhookLog;
}

const HEADERS = { "Cache-Control": "no-store" } as const;

function reply(body: object, status: number): Response {
  return Response.json(body, { status, headers: HEADERS });
}

export function isHandledEvent(type: string): type is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}

/** The customer an event is about, from the object it carries; null when it names none. */
export function customerOfEvent(event: Stripe.Event): string | null {
  const object = event.data.object as { customer?: unknown };
  return asCustomerId(object.customer);
}

export async function handleStripeWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const { config } = deps;
  if (!config) return reply({ error: "billing_not_configured" }, 503);

  const signature = request.headers.get("stripe-signature");
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    if (!signature) throw new Error("no signature");
    event = deps.constructEvent(payload, signature, config.webhookSecret);
  } catch {
    deps.log("warn", "webhook signature refused", {});
    return reply({ error: "invalid_signature" }, 400);
  }

  const about = { event: event.id, type: event.type, livemode: event.livemode };
  if (!isHandledEvent(event.type)) return reply({ received: true }, 200);

  const customer = customerOfEvent(event);
  if (customer) {
    let outcome: SyncOutcome;
    try {
      outcome = await deps.sync(customer);
    } catch (error) {
      deps.log("error", "billing sync failed", { ...about, customer, error: errorName(error) });
      return reply({ error: "sync_failed" }, 500);
    }
    deps.log("info", "billing synced", { ...about, customer, outcome: outcome.kind });
  }

  try {
    const fresh = await deps.claim({
      id: event.id,
      type: event.type,
      livemode: event.livemode,
    });
    if (!fresh) deps.log("info", "event already processed", about);
  } catch (error) {
    deps.log("error", "claiming the event failed", { ...about, error: errorName(error) });
    return reply({ error: "claim_failed" }, 500);
  }
  return reply({ received: true }, 200);
}

/**
 * What went wrong, without anything that could be personal: the error's class and message. The
 * sync's own errors carry Postgres codes and Stripe ids; a Stripe API error's message names the
 * request, never the key.
 */
function errorName(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : "unknown error";
}
