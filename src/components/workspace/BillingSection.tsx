"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth/FormError";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import type { WorkspaceAccess } from "@/lib/billing/access";
import { BILLING_ACTION_LABELS, billingConfirmation, billingView } from "@/lib/billing/billingCopy";
import { billingActionVariant, billingTone } from "./billingPresentation";

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
 *
 * The state is one `Notice` (#563): a status for free access, a trial or a subscription, and an
 * alert for a failed payment or a workspace without access (`billingTone`), shown with the alert's
 * look but no live role, since it is on the page when it loads. Its first sentence is
 * the title, and the one button sits under the words, as the main action where acting is the
 * point (`billingActionVariant`). After a confirmed Checkout the thanks lead the same notice.
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
  const [title, ...body] = thanks ? [thanks, ...view.lines] : view.lines;
  const [state, submit, pending] = useActionState(
    view.action === "portal" ? portalAction : checkoutAction,
    INITIAL,
  );

  return (
    <section aria-labelledby="billing-heading" className="flex max-w-prose flex-col gap-4">
      <h2 id="billing-heading" className="text-lg font-medium text-ink-1">
        Billing
      </h2>
      <Notice
        role={billingTone(access)}
        live={false}
        title={title}
        action={
          view.action ? (
            <form action={submit}>
              {/* Busy, not disabled (docs/04 §11): the label and the width stay while Stripe opens. */}
              <Button
                type="submit"
                variant={billingActionVariant(access, view.action)}
                busy={pending}
              >
                {BILLING_ACTION_LABELS[view.action]}
              </Button>
            </form>
          ) : null
        }
      >
        {body.length > 0 ? body.map((line) => <p key={line}>{line}</p>) : null}
      </Notice>
      {state.status === "error" ? <FormError>{state.error}</FormError> : null}
    </section>
  );
}
