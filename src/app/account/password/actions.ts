"use server";

import { redirect } from "next/navigation";
import type { ChoosePasswordState } from "@/components/auth/ChoosePasswordForm";
import { PASSWORD_PATH } from "@/lib/auth/accountPaths";
import { readDemoAccount } from "@/lib/auth/demoAccount";
import { saveNewPassword } from "@/lib/auth/password";
import { readViewer } from "@/lib/classes/viewer";

const DEMO_PASSWORD_FIXED = "The demo account is shared, so its password cannot be changed.";

/**
 * Saves the signed-in person's password. The session is the proof of who they are: it came from
 * a password they knew or a link sent to their address. Their other sessions are then signed out.
 */
export async function choosePassword(
  _previous: ChoosePasswordState,
  formData: FormData,
): Promise<ChoosePasswordState> {
  const viewer = await readViewer();
  if (viewer.status === "signed_out") {
    redirect(`/sign-in?next=${encodeURIComponent(PASSWORD_PATH)}`);
  }
  // Everyone who taps "Use the demo account" shares it; one of them must not lock out the rest.
  if (readDemoAccount()?.email === viewer.email.toLowerCase()) {
    return { status: "error", error: DEMO_PASSWORD_FIXED };
  }

  const { auth } = viewer.supabase;
  const saved = await saveNewPassword(formData.get("password"), {
    update: (attributes) => auth.updateUser(attributes),
    signOutOthers: () => auth.signOut({ scope: "others" }),
  });
  return saved.ok ? { status: "saved" } : { status: "error", error: saved.error };
}
