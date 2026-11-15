import type { ButtonVariant } from "@/components/ui/Button";
import type { NoticeRole } from "@/components/ui/Notice";
import type { WorkspaceAccess } from "@/lib/billing/access";
import type { BillingAction } from "@/lib/billing/billingCopy";

/**
 * How the Billing section looks in each state (#563 round 3): presentation only. What it says and
 * which button it offers stay `billingView`'s (`src/lib/billing/billingCopy.ts`).
 *
 * A failed payment and a workspace without access (read-only once billing is enforced) are alerts:
 * the strong rule and the alert mark, so they never read as calm as a trial does. Everything else
 * (free access, a trial, a subscription, renewing or ending) is a status.
 */
export function billingTone(access: WorkspaceAccess): NoticeRole {
  return access.state.kind === "payment_failed" || !access.hasAccess ? "alert" : "status";
}

/**
 * The section's one button, as the main action where acting is the point: start the trial,
 * subscribe, or fix a failed payment. Managing a trial or a subscription that is fine is a quiet
 * secondary button, so a calm state does not shout.
 */
export function billingActionVariant(
  access: WorkspaceAccess,
  action: BillingAction,
): Extract<ButtonVariant, "primary" | "secondary"> {
  if (action !== "portal") return "primary";
  return access.state.kind === "payment_failed" ? "primary" : "secondary";
}
