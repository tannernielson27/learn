import { cache } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface VerifiedProfile {
  supabase: ServerClient;
  /** The verified token's `sub`, or null for a request with no session. */
  userId: string | null;
  email: string;
  /** The viewer's own profile row, which RLS lets them read; null when there is none. */
  profile: Pick<
    Database["public"]["Tables"]["profiles"]["Row"],
    "org_id" | "role" | "display_name"
  > | null;
}

/**
 * Who is signed in, verified, and their profile: `getClaims` checks the token rather than trusting
 * the cookie, and the profile is read as that user. `readViewer` and `authorForRoute` both answer
 * from this, each with its own rules.
 *
 * React's `cache` keeps it for the current server render only (perf-audit #20), so a layout and its
 * page share one verification and one profile read per request instead of two. Nothing outlives
 * the request. Outside a render (Route Handlers, Server Functions) every call reads afresh, as
 * before.
 */
export const readVerifiedProfile = cache(async (): Promise<VerifiedProfile> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { supabase, userId: null, email: "", profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role, display_name")
    .eq("id", userId)
    .maybeSingle();
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  return { supabase, userId, email, profile: profile ?? null };
});
