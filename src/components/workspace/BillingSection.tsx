"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/FormError";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { WorkspaceAccess } from "@/lib/billing/access";
import {
  BILLING_ACTION_LABELS,
  billingConfirmation,
  billingView,
  type BillingAction,
} from "@/lib/billing/billingCopy";

export type BillingActionState = { status: "idle" } | { status: "error"; error: string };

type BillingFormAction = (
  state: BillingActionState,
  formData: FormData,
) => Promise<BillingActionState>;

export interface BillingSectionProps {
  access: WorkspaceAccess;
  /** Stripe is set up on this deployment. Without it there is never a button. */
  configured: boolean;
  /** Neither this person nor this workspace has had a free trial. */
  trialAvailable: boolean;
  /** Back from a Checkout the server confirmed: thank the teacher once the state shows it. */
  confirmed?: boolean;
  /** Start your free trial and Subscribe. On success it leaves for Stripe. */
  checkoutAction: BillingFormAction;
  /** Manage billing. On success it leaves for Stripe. */
  portalAction: BillingFormAction;
}

const INITIAL: BillingActionState = { status: "idle" };

/**
 * The Billing section of the workspace page (#519, ADR 0016): where the workspace stands in a
 * sentence or two, and at most one button, for the person who started the workspace only. The
 * buttons are a courtesy: the Server Functions check who is asking again. Free access says only
 * that; it never names where it came from.
 */
export function BillingSection({
  access,
  configured,
  trialAvailable,
  confirmed = false,
  checkoutAction,
  portalAction,
}: BillingSectionProps) {
  const view = billingView(access, { configured, trialAvailable });
  const thanks = confirmed ? billingConfirmation(access) : null;

  return (
    <section aria-labelledby="billing-heading">
      <h2 id="billing-heading" className="mb-3 text-lg font-medium text-ink-1">
        Billing
      </h2>
      {thanks ? <Notice className="mb-4">{thanks}</Notice> : null}
      <div className="flex max-w-prose flex-col gap-1 text-ink-1">
        {view.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {view.action ? (
        <BillingButton
          action={view.action}
          formAction={view.action === "portal" ? portalAction : checkoutAction}
        />
      ) : null}
    </section>
  );
}

function BillingButton({
  action,
  formAction,
}: {
  action: BillingAction;
  formAction: BillingFormAction;
}) {
  const [state, submit, pending] = useActionState(formAction, INITIAL);
  return (
    <form action={submit} className="mt-4 flex flex-col gap-3 sm:max-w-md">
      {state.status === "error" ? <FormError>{state.error}</FormError> : null}
      <div>
        <Button
          type="submit"
          variant={action === "portal" ? "secondary" : "primary"}
          disabled={pending}
        >
          {pending ? "Opening…" : BILLING_ACTION_LABELS[action]}
        </Button>
      </div>
    </form>
  );
}
