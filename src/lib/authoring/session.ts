import { redirect } from "next/navigation";
import { WELCOME_PATH } from "@/lib/auth/accountPaths";
import { readVerifiedProfile } from "@/lib/auth/verifiedProfile";
import type { ReadOnlyState } from "@/lib/billing/enforcement";
import { STUDENT_HOME } from "@/lib/classes/classes";
import type { createSupabaseServerClient } from "@/lib/supabase/server";
import { authorReadOnly } from "./readOnly";

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
  | ({
      status: "ok";
      /**
       * Set when billing is enforced and the workspace has no access (#521): pages and reads
       * still work, writes are refused (`requireWriter`). Null or absent: the teacher may write.
       */
      readOnly?: ReadOnlyState | null;
    } & AuthorSession)
  | { status: "signed_out" }
  | { status: "forbidden"; role?: "student" | null };

/**
 * The real access check (the proxy's redirect is only optimistic). Verifies the session token,
 * then the profile (one shared read per request: `readVerifiedProfile`): an author is an instructor or admin with an org. RLS still decides every row.
 * Route handlers use this directly, since they answer with a status code rather than a redirect.
 *
 * `readOnly` (#521) is read only when `BILLING_ENFORCED` is "true", once per request; with
 * enforcement off it is null and nothing extra is read.
 */
export async function authorForRoute(): Promise<RouteAuthor> {
  const { supabase, userId, email, profile } = await readVerifiedProfile();
  if (!userId) return { status: "signed_out" };

  if (!profile?.org_id || (profile.role !== "instructor" && profile.role !== "admin")) {
    return { status: "forbidden", role: profile?.role === "student" ? "student" : null };
  }

  const readOnly = await authorReadOnly(supabase);
  return { status: "ok", supabase, userId, email, orgId: profile.org_id, readOnly };
}

/**
 * The session `requireAuthor` hands back. `readOnly` is what `authorForRoute` found (#521), so a
 * write gate after it (`requireWriter`) reads nothing more.
 */
export type CheckedAuthorSession = AuthorSession & { readOnly?: ReadOnlyState | null };

/** The same check for authoring pages and Server Functions, as redirects. */
export async function requireAuthor(returnTo: string): Promise<CheckedAuthorSession> {
  const author = await authorForRoute();
  if (author.status === "signed_out") redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  if (author.status === "forbidden") {
    redirect(author.role === "student" ? STUDENT_HOME : WELCOME_PATH);
  }
  const { supabase, userId, email, orgId, readOnly } = author;
  return { supabase, userId, email, orgId, readOnly: readOnly ?? null };
}
