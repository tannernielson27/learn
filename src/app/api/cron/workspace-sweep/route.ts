import { handleWorkspaceSweep } from "@/lib/workspaceSweep/sweepRoute";
import { workspaceSweepDeps } from "@/lib/workspaceSweep/sweepDeps";

/** One database call that deletes at most 20 workspaces; Vercel Hobby allows up to 60 seconds. */
export const maxDuration = 60;

/**
 * pg_cron calls this once a day (ADR 0012, docs/05 §7.13): a dry run of the abandoned-workspace
 * sweep, or a deleting one when `WORKSPACE_SWEEP` is exactly `delete`. POST only, with
 * `Authorization: Bearer <CRON_SECRET>`; any other method gets Next's 405. See
 * `handleWorkspaceSweep`.
 */
export async function POST(request: Request): Promise<Response> {
  return handleWorkspaceSweep(request, workspaceSweepDeps());
}
