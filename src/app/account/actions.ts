"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { AccountNameState } from "@/components/auth/AccountNameForm";
import { ACCOUNT_PATH } from "@/lib/auth/accountPaths";
import { readDemoAccount } from "@/lib/auth/demoAccount";
import { parseAccountName } from "@/lib/auth/displayName";
import { readViewer } from "@/lib/classes/viewer";

const DEMO_NAME_FIXED = "The demo account is shared, so its name cannot be changed.";
const NAME_NOT_SAVED = "Your name could not be saved just now. Try again.";

/**
 * Saves the signed-in person's name (#358). The row is the session's own, through their own
 * client: RLS ("users rename themselves") and the column grant (`update (display_name)`) are the
 * boundary, and nothing the form carries chooses whose row it is.
 */
export async function saveDisplayName(
  _previous: AccountNameState,
  formData: FormData,
): Promise<AccountNameState> {
  const viewer = await readViewer();
  if (viewer.status === "signed_out") {
    redirect(`/sign-in?next=${encodeURIComponent(ACCOUNT_PATH)}`);
  }
  // Everyone who taps "Use the demo account" shares it, and sees whatever one of them typed.
  if (readDemoAccount()?.email === viewer.email.toLowerCase()) {
    return { status: "error", error: DEMO_NAME_FIXED };
  }

  const name = parseAccountName(formData.get("displayName"));
  if (!name.ok) return { status: "error", error: name.error };

  const { data, error } = await viewer.supabase
    .from("profiles")
    .update({ display_name: name.name })
    .eq("id", viewer.userId)
    .select("id");
  if (error || data?.length !== 1) {
    const { status, code } = (error ?? {}) as { status?: number; code?: string };
    // Never the name: what someone calls themselves is not the log's business.
    console.error("[account] the name was not saved", { status, code, rows: data?.length ?? 0 });
    return { status: "error", error: NAME_NOT_SAVED };
  }

  // The header reads the name on every page; this page reads it again too.
  refresh();
  return { status: "saved", name: name.name };
}
