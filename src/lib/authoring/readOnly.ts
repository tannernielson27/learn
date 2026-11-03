import { billingEnforced, readOnlyFor, type ReadOnlyState } from "@/lib/billing/enforcement";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { readWorkspaceAccessOnce } from "@/lib/supabase/workspaceAccess";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Whether a teacher's workspace is read-only (#521, ADR 0016 "A lapsed workspace is read-only"):
 * `BILLING_ENFORCED` is "true" and `workspace_access()` says the workspace has no access.
 *
 * With enforcement off (the default) this reads nothing and answers null, so nothing a teacher can
 * do changes. With it on, the answer is read once per request through `readWorkspaceAccessOnce`.
 * A failed read answers null: the database's own gate (`private.write_allowed()`) still refuses
 * the write, so one failed read never locks every teacher out.
 */
export async function authorReadOnly(
  supabase: ServerClient,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<ReadOnlyState | null> {
  if (!billingEnforced(env)) return null;
  return readOnlyFor(true, await readWorkspaceAccessOnce(supabase));
}
