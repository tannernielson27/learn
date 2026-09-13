import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface AuthorSession {
  supabase: ServerClient;
  userId: string;
  email: string;
  orgId: string;
}

/**
 * The real access check for authoring pages and Server Functions (the proxy's redirect is only
 * optimistic). Verifies the session token, then the profile: an author is an instructor or admin
 * with an org. RLS still decides every row.
 */
export async function requireAuthor(returnTo: string): Promise<AuthorSession> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.org_id || (profile.role !== "instructor" && profile.role !== "admin")) {
    redirect("/author/no-access");
  }

  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  return { supabase, userId, email, orgId: profile.org_id };
}
