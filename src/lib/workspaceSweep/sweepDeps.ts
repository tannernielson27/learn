import { sharedRateLimitStore } from "@/lib/rateLimit/postgresStore";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { sweepAbandonedWorkspaces } from "@/lib/supabase/workspaceSweep";
import { createSweepLimiter, type WorkspaceSweepDeps } from "./sweepRoute";

/**
 * The real dependencies of the workspace sweep route. The service client is made only when a run
 * asks for it, which is after the secret has been checked, so an unauthorised request never
 * builds a client that can delete anything. `WORKSPACE_SWEEP` is passed on exactly as set:
 * `sweepMode` compares it, untrimmed, with `delete`.
 */
export function workspaceSweepDeps(): WorkspaceSweepDeps {
  return {
    secret: process.env.CRON_SECRET,
    mode: process.env.WORKSPACE_SWEEP,
    sweep: (options) => sweepAbandonedWorkspaces(createSupabaseServiceClient(), options),
    limiter: createSweepLimiter(sharedRateLimitStore()),
  };
}
