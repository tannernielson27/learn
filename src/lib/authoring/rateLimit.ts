import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The authoring actions with a per-user limit. The limits themselves (all per minute: save 60,
 * publish 20, import 10, step 30) live in the database, since Vercel's serverless functions share
 * no memory and a caller must not choose its own window.
 *
 * Since #123 the count is taken at the write — by triggers on the authoring tables and by the two
 * authoring functions — so the same limit applies whether an action arrives through a Server
 * Action or straight through PostgREST. `checkRateLimit` below only *asks* whether there is room.
 */
export const RATE_LIMITED_ACTIONS = ["save", "publish", "import", "step"] as const;

export type RateLimitedAction = (typeof RATE_LIMITED_ACTIONS)[number];

export const RATE_LIMIT_ERRORS = {
  limited: "You are doing that too often. Wait a minute, then try again.",
  unchecked: "That could not be done just now. Try again in a moment.",
} as const;

interface DbError {
  code?: string;
}

/**
 * 54000: the database refused a write because the author is over the limit for its action (see
 * `20260921200000_authoring_limit_at_the_write`). The action asks first, so this is the narrow
 * race where the budget ran out between the question and the write — and the only answer a caller
 * that skipped the question gets.
 */
export function isRateLimitedError(error: DbError | null): boolean {
  return error?.code === "54000";
}

/**
 * Asks whether the signed-in author has room for one more of this action, before the action does
 * any work worth skipping — reading an import file, assembling a case study. It spends nothing:
 * the write itself is what counts. When the answer cannot be had, the action is refused rather
 * than let through.
 */
export async function checkRateLimit(
  client: SupabaseClient<Database>,
  action: RateLimitedAction,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("take_rate_limit", { action_name: action });
  if (error || typeof data !== "boolean") return { ok: false, error: RATE_LIMIT_ERRORS.unchecked };
  return data ? { ok: true } : { ok: false, error: RATE_LIMIT_ERRORS.limited };
}
