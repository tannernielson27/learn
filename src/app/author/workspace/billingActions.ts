"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { BillingActionState } from "@/components/workspace/BillingSection";
import { requireAuthor } from "@/lib/authoring/session";
import { BILLING_REFUSAL_MESSAGES } from "@/lib/billing/billingCopy";
import { openPortal, startCheckout, type BillingOutcome } from "@/lib/billing/checkout";
import { billingDeps } from "@/lib/billing/checkoutDeps";
import { WORKSPACE_PATH } from "@/lib/workspace/workspace";

/**
 * The Billing section's two buttons (#519): Start your free trial or Subscribe, and Manage
 * billing. Neither reads anything the form sends. The workspace is the caller's own, from
 * `requireAuthor`; the account and its address are the auth server's (`getUser`); whether the
 * caller started the workspace is read again inside `startCheckout` and `openPortal`. Success
 * leaves for Stripe's hosted page.
 */
async function billingRequest() {
  const { supabase, orgId } = await requireAuthor(WORKSPACE_PATH);
  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user;
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(WORKSPACE_PATH)}`);
  const caller = { userId: user.id, email: user.email ?? "", orgId };
  const deps = billingDeps({ supabase, orgId, userId: user.id, requestHeaders: await headers() });
  return { caller, deps };
}

function answer(outcome: BillingOutcome): BillingActionState {
  // Outside any try, because redirect() works by throwing.
  if (outcome.ok) redirect(outcome.url);
  return { status: "error", error: BILLING_REFUSAL_MESSAGES[outcome.reason] };
}

export async function startCheckoutAction(): Promise<BillingActionState> {
  const { caller, deps } = await billingRequest();
  return answer(await startCheckout(caller, deps));
}

export async function openPortalAction(): Promise<BillingActionState> {
  const { caller, deps } = await billingRequest();
  return answer(await openPortal(caller, deps));
}
