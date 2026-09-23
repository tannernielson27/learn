import { redirect } from "next/navigation";
import { NO_ACCESS_PATH } from "@/lib/auth/noAccess";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export interface AuthorSession {
  supabase: ServerClient;
  userId: string;
  email: string;
  orgId: string;
}

/**
 * `role` says who a forbidden account is, so a student can be sent to the student home (#205)
 * rather than to "No access yet". It is never an author role: those are `ok` or have no org.
 */
export type RouteAuthor =
  | ({ status: "ok" } & AuthorSession)
  | { status: "signed_out" }
  | { status: "forbidden"; role?: "student" | null };

/**
 * The real access check (the proxy's redirect is only optimistic). Verifies the session token,
 * then the profile: an author is an instructor or admin with an org. RLS still decides every row.
 * Route handlers use this directly, since they answer with a status code rather than a redirect.
 */
export async function authorForRoute(): Promise<RouteAuthor> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { status: "signed_out" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.org_id || (profile.role !== "instructor" && profile.role !== "admin")) {
    return { status: "forbidden", role: profile?.role === "student" ? "student" : null };
  }

  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  return { status: "ok", supabase, userId, email, orgId: profile.org_id };
}

/** The same check for authoring pages and Server Functions, as redirects. */
export async function requireAuthor(returnTo: string): Promise<AuthorSession> {
  const author = await authorForRoute();
  if (author.status === "signed_out") redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  if (author.status === "forbidden") {
    redirect(author.role === "student" ? STUDENT_HOME : NO_ACCESS_PATH);
  }
  const { supabase, userId, email, orgId } = author;
  return { supabase, userId, email, orgId };
}
