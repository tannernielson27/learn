import type { SupabaseClient } from "@supabase/supabase-js";
import { toWorkspaceAccess, type WorkspaceAccess } from "@/lib/billing/access";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/**
 * The caller's workspace's billing state, from `public.workspace_access()` (#517), run as the
 * signed-in teacher. Null for no row (not a teacher of a workspace) and for a failure, which
 * includes a database the billing migration has not reached yet: the page then draws no Billing
 * section rather than a wrong one.
 */
export async function readWorkspaceAccess(client: Client): Promise<WorkspaceAccess | null> {
  const { data, error } = await client.rpc("workspace_access");
  if (error) {
    console.error("[billing] workspace_access could not answer", { code: error.code });
    return null;
  }
  return toWorkspaceAccess(Array.isArray(data) ? data[0] : null);
}
