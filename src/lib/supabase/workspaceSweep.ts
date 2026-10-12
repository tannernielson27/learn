import type { SupabaseClient } from "@supabase/supabase-js";
import type { SweepResult, SweepRow } from "@/lib/workspaceSweep/sweepRoute";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

const SWEEP_FUNCTION = "sweep_abandoned_workspaces";

/**
 * Whether the error says migration 20261012000000 is not applied to this database yet: PostgREST
 * found no function with that name and those arguments (PGRST202), or Postgres itself says the
 * sweep function does not exist. A 42883 about anything else is a function missing INSIDE the
 * sweep, which is a real failure and must not be answered as "not available".
 */
function sweepIsMissing(error: { code?: string; message?: string }): boolean {
  if (error.code === "PGRST202") return true;
  return error.code === "42883" && (error.message ?? "").includes(SWEEP_FUNCTION);
}

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
  const { data, error } = await service.rpc(SWEEP_FUNCTION, {
    p_delete: options.delete,
    p_limit: options.limit,
  });
  if (error) {
    if (sweepIsMissing(error)) return { status: "not_available" };
    throw new Error(`${SWEEP_FUNCTION}: ${error.code ?? "unknown"}`);
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
