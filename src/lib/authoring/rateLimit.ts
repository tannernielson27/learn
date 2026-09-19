import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The authoring actions with a per-user limit. The limits themselves (all per minute: save 60,
 * publish 20, import 10, step 30) live in the database function `private.take_rate_limit`, since
 * Vercel's serverless functions share no memory and a caller must not choose its own window.
 */
export const RATE_LIMITED_ACTIONS = ["save", "publish", "import", "step"] as const;

export type RateLimitedAction = (typeof RATE_LIMITED_ACTIONS)[number];

export const RATE_LIMIT_ERRORS = {
  limited: "You are doing that too often. Wait a minute, then try again.",
  unchecked: "That could not be done just now. Try again in a moment.",
} as const;

/**
 * Counts one call of an authoring action against the signed-in user's limit, before it writes
 * anything. When the count cannot be checked, the action is refused rather than let through.
 */
export async function checkRateLimit(
  client: SupabaseClient<Database>,
  action: RateLimitedAction,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await client.rpc("take_rate_limit", { action_name: action });
  if (error || typeof data !== "boolean") return { ok: false, error: RATE_LIMIT_ERRORS.unchecked };
  return data ? { ok: true } : { ok: false, error: RATE_LIMIT_ERRORS.limited };
}
