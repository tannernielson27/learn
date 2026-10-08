"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { JoinByCodeState } from "@/components/classes/JoinByCodeForm";
import { WELCOME_PATH } from "@/lib/auth/accountPaths";
import { takeClassCodeAttempt } from "@/lib/auth/classCodeLimit";
import { isClassCode, normalizeClassCode } from "@/lib/classes/classCode";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { readViewer } from "@/lib/classes/viewer";
import { joinClassByCode } from "@/lib/supabase/classInvites";

const CODE_INCOMPLETE = "Enter the eight letters and numbers of your class code, like ABCD-2345.";
// One answer for an unknown code, a class in another workspace and a class the student was removed
// from: the database does not say which, so that a code cannot be probed.
const CODE_DID_NOT_WORK =
  "That class code did not work. Check it with your instructor. If you were removed from the class, only they can add you back.";
const CODES_LIMITED = "Too many class codes tried. Wait a few minutes, then try again.";
const UNAVAILABLE = "Joining is not working just now. Try again in a moment.";

/**
 * Joins a class by the code someone typed (#362), from the student home or the welcome page.
 *
 * `join_class_by_code` runs as the caller, so who joins is the verified session and never
 * anything in the form. It counts every try against the caller's own account, never changes an
 * instructor, and makes an account with no role a student of the class's workspace. A code that
 * is not eight characters of the code alphabet is turned back here without spending a try: its
 * shape is public, so that says nothing about any class.
 *
 * Accounts are cheap since open sign-up, so every try is also counted against the address the
 * request came from (`takeClassCodeAttempt`), which making another account does not reset. It
 * answers in the words the account's own limit already uses.
 */
export async function joinClassWithCode(
  _previous: JoinByCodeState,
  formData: FormData,
): Promise<JoinByCodeState> {
  const viewer = await readViewer();
  if (viewer.status === "signed_out") {
    redirect(`/sign-in?next=${encodeURIComponent(WELCOME_PATH)}`);
  }

  const typed = formData.get("code");
  const code = normalizeClassCode(typeof typed === "string" ? typed : "");
  if (!isClassCode(code)) return { status: "error", error: CODE_INCOMPLETE };

  // Before the database is asked, so a refused address looks nothing up and spends nothing of the
  // account's own budget. Counted whatever the code is, so the refusal says nothing about it.
  const allowed = await takeClassCodeAttempt(await headers());
  if (allowed === "rate_limited") return { status: "error", error: CODES_LIMITED };
  if (allowed === "unavailable") return { status: "error", error: UNAVAILABLE };

  const answer = await joinClassByCode(viewer.supabase, code);
  if (answer === "instructor") return { status: "instructor" };
  if (answer === "invalid") return { status: "error", error: CODE_DID_NOT_WORK };
  if (answer === "rate_limited") return { status: "error", error: CODES_LIMITED };
  if (answer === "unavailable") return { status: "error", error: UNAVAILABLE };
  // Outside every branch above, because redirect() works by throwing.
  redirect(STUDENT_HOME);
}

/**
 * Records that the signed-in student has seen the welcome (#365), so it never shows again on any
 * device. `mark_onboarded` stamps the caller's own profile and nobody else's, and a second call
 * changes nothing. A failure is logged and not shown: the welcome is already closed, and the only
 * cost is that it shows once more.
 */
export async function markStudentOnboarded(): Promise<void> {
  const viewer = await readViewer();
  if (viewer.status === "signed_out") return;
  const { error } = await viewer.supabase.rpc("mark_onboarded");
  if (error) {
    console.error("[onboarding] the welcome could not be recorded as seen", { code: error.code });
    return;
  }
  revalidatePath(STUDENT_HOME);
}
