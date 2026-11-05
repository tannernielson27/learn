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

/**
 * Whether the caller's workspace has ever had free access (#522): any `access_grants` row, which
 * RLS limits to the teacher's own workspace. Asked only once `workspace_access()` has said the
 * workspace has no access, so any row there is one that was revoked or has expired. False on a
 * failure, so the banner errs towards saying nothing.
 */
export async function readHadGrant(client: Client): Promise<boolean> {
  const { data, error } = await client.from("access_grants").select("kind").limit(1);
  if (error) {
    console.error("[billing] access_grants could not answer", { code: error.code });
    return false;
  }
  return (data?.length ?? 0) > 0;
}
