import type { SupabaseClient } from "@supabase/supabase-js";
import type { SweepResult, SweepRow } from "@/lib/workspaceSweep/sweepRoute";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/**
 * PostgREST's "no function with that name and those arguments", and Postgres's own. Either means
 * migration 20261012000000 is not applied to this database yet.
 */
const NO_SUCH_FUNCTION: ReadonlySet<string> = new Set(["PGRST202", "42883"]);

/**
 * `public.sweep_abandoned_workspaces` (ADR 0012), with the service role: the function is granted
 * to `service_role` and to nobody else. With `delete` false the database changes nothing.
 *
 * An error names the function and the Postgres code and nothing else, so the route can log it.
 */
export async function sweepAbandonedWorkspaces(
  service: Client,
  options: { delete: boolean; limit: number },
): Promise<SweepResult> {
  const { data, error } = await service.rpc("sweep_abandoned_workspaces", {
    p_delete: options.delete,
    p_limit: options.limit,
  });
  if (error) {
    if (error.code && NO_SUCH_FUNCTION.has(error.code)) return { status: "not_available" };
    throw new Error(`sweep_abandoned_workspaces: ${error.code ?? "unknown"}`);
  }
  return {
    status: "ok",
    rows: (data ?? []).map((row): SweepRow => ({
      orgId: row.org_id,
      rule: row.rule,
      outcome: row.outcome,
      reason: row.reason ?? null,
    })),
  };
}
