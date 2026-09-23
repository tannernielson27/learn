import { redirect } from "next/navigation";
import { NO_ACCESS_PATH } from "@/lib/auth/noAccess";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STUDENT_HOME } from "./classes";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type OrgRole = Database["public"]["Enums"]["org_role"];

export interface SignedInViewer {
  status: "signed_in";
  supabase: ServerClient;
  userId: string;
  email: string;
  /** Null for an account nobody has given a role yet (#204). */
  role: OrgRole | null;
}

export type Viewer = { status: "signed_out" } | SignedInViewer;

/**
 * Who is looking, verified: `getClaims` checks the token rather than trusting the cookie, and the
 * role comes from the viewer's own profile row, which RLS lets them read. For the student home and
 * the class invite page, which answer students, authors and visitors differently.
 */
export async function readViewer(): Promise<Viewer> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return { status: "signed_out" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("id", userId)
    .maybeSingle();
  const email = typeof data.claims.email === "string" ? data.claims.email : "";
  return { status: "signed_in", supabase, userId, email, role: profile?.role ?? null };
}

export interface StudentSession {
  supabase: ServerClient;
  userId: string;
  email: string;
}

/**
 * The student home's check. A student stays; everyone else goes to their own home: a visitor to
 * sign in (and back here), an author to authoring, an account with no role to "No access yet".
 */
export async function requireStudent(): Promise<StudentSession> {
  const viewer = await readViewer();
  if (viewer.status === "signed_out") {
    redirect(`/sign-in?next=${encodeURIComponent(STUDENT_HOME)}`);
  }
  if (viewer.role === "instructor" || viewer.role === "admin") redirect("/author");
  if (viewer.role !== "student") redirect(NO_ACCESS_PATH);
  const { supabase, userId, email } = viewer;
  return { supabase, userId, email };
}
