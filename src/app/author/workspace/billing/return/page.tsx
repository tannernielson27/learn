import { redirect } from "next/navigation";
import { requireAuthor } from "@/lib/authoring/session";
import { BILLING_CONFIRMED_QUERY, confirmCheckoutReturn } from "@/lib/billing/checkout";
import { billingReadDeps } from "@/lib/billing/checkoutDeps";
import { WORKSPACE_PATH } from "@/lib/workspace/workspace";

// Rendered for each request and never stored: it asks Stripe about one Checkout.
export const dynamic = "force-dynamic";

/**
 * Where Stripe's Checkout sends a teacher back (#519). It draws nothing. The Checkout Session is
 * fetched from Stripe by its id and must be a finished one made for the caller's own workspace;
 * then the workspace is synced at once, so the workspace page is right before the webhook lands,
 * and the page thanks the teacher. Anything else (another workspace's session, an unknown or
 * malformed id) goes back to the workspace page with nothing said.
 */
export default async function BillingReturnPage({
  searchParams,
}: PageProps<"/author/workspace/billing/return">) {
  const { orgId } = await requireAuthor(WORKSPACE_PATH);
  const { session_id: sessionId } = await searchParams;
  const outcome = await confirmCheckoutReturn(
    typeof sessionId === "string" ? sessionId : "",
    { orgId },
    billingReadDeps(),
  );
  redirect(
    outcome === "confirmed" ? `${WORKSPACE_PATH}?${BILLING_CONFIRMED_QUERY}` : WORKSPACE_PATH,
  );
}
