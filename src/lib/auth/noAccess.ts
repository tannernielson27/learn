import { STUDENT_HOME } from "@/lib/classes/classes";
import { WELCOME_PATH } from "./accountPaths";

/**
 * The address of the old "No access yet" page (#204). Nothing is sent here any more: since #362 an
 * account with no role goes to the welcome page. The route stays, as a redirect, for anyone who
 * kept the address.
 */
export const NO_ACCESS_PATH = "/author/no-access";

const AUTHOR_HOME = "/author";

export type AccessStatus = "ok" | "signed_out" | "forbidden";

/**
 * Where the old No access address sends each visitor, which is their own home: an author to the
 * bank list, a student to the student home (#205), a signed-out visitor to sign in (and on to
 * authoring once they have), and an account with no role to the welcome page (#362), where it can
 * join a class or set up a workspace.
 */
export function noAccessRedirect(status: AccessStatus, role: "student" | null = null): string {
  if (status === "ok") return AUTHOR_HOME;
  if (status === "signed_out") return `/sign-in?next=${encodeURIComponent(AUTHOR_HOME)}`;
  return role === "student" ? STUDENT_HOME : WELCOME_PATH;
}
