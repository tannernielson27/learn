import type { Database } from "@/lib/supabase/database.types";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { WELCOME_PATH } from "./accountPaths";

type OrgRole = Database["public"]["Enums"]["org_role"];

/** Who is looking at the landing page, as far as picking its first link needs to know. */
export type LandingVisitor =
  { status: "signed_out" } | { status: "signed_in"; role: OrgRole | null };

export interface LandingEntry {
  href: string;
  label: string;
}

/**
 * The landing page's first link (#264). A visitor is offered Sign in; anyone already signed in is
 * offered their own home instead, so the page never asks a signed-in instructor to sign in again.
 * An account with no role goes to the welcome page (#362), where it joins a class or sets up a
 * workspace.
 */
export function landingEntry(visitor: LandingVisitor): LandingEntry {
  if (visitor.status === "signed_out") return { href: "/sign-in", label: "Sign in" };
  switch (visitor.role) {
    case "instructor":
    case "admin":
      return { href: "/author", label: "Go to your item banks" };
    case "student":
      return { href: STUDENT_HOME, label: "Go to your classes" };
    default:
      return { href: WELCOME_PATH, label: "Get started" };
  }
}

/**
 * Where a signed-in person belongs when a page is not for them (#361): sign-up for someone who has
 * an account, the welcome page for someone who has a role. An account with no role belongs on the
 * welcome page, which is where open sign-up leaves it.
 */
export function signedInHome(role: OrgRole | null): string {
  if (role === "instructor" || role === "admin") return "/author";
  return role === "student" ? STUDENT_HOME : WELCOME_PATH;
}
