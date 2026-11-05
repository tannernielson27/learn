import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { readHadGrant, readWorkspaceAccess } from "@/lib/supabase/workspaceAccess";
import type { WorkspaceAccess } from "./access";
import { billingBanner, type BillingBanner } from "./banner";
import { readStripeConfig } from "./stripeConfig";

type Client = SupabaseClient<Database>;

/**
 * `workspace_access()` once per server render (#522): the author layout's banner and the workspace
 * page's Billing section both ask, with the one client `readVerifiedProfile` made for the request,
 * so React's `cache` answers the second from the first. Nothing outlives the request.
 */
export const readWorkspaceAccessOnce = cache((client: Client): Promise<WorkspaceAccess | null> =>
  readWorkspaceAccess(client),
);

/**
 * The banner for the author layout, or null. Without Stripe set up here it reads nothing at all.
 * The grant history is read only for a workspace with no access, the one state that needs it.
 */
export async function readBillingBanner(
  client: Client,
  now: Date = new Date(),
): Promise<BillingBanner | null> {
  if (readStripeConfig(process.env).config === null) return null;
  const access = await readWorkspaceAccessOnce(client);
  const hadGrant =
    access !== null && !access.hasAccess && access.state.kind === "none"
      ? await readHadGrant(client)
      : false;
  return billingBanner(access, { now, configured: true, hadGrant });
}
