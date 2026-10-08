"use server";

import { redirect } from "next/navigation";
import type { WorkspaceState } from "@/components/auth/SetUpWorkspace";
import { WELCOME_PATH } from "@/lib/auth/accountPaths";
import { signedInHome } from "@/lib/auth/landing";
import { DEFAULT_AFTER_SIGN_IN } from "@/lib/auth/nextPath";
import { workspaceName } from "@/lib/auth/signUp";
import { readViewer } from "@/lib/classes/viewer";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

const WORKSPACE_FAILED = "Your workspace could not be set up just now. Try again in a moment.";

/** `register_instructor`'s refusal of an account that already has a role. */
const ALREADY_HAS_A_ROLE = "23514";

/**
 * The welcome page's "Set up my workspace" (#361): the second try for a teacher whose workspace
 * could not be made at sign-up.
 *
 * The account is the one whose session this request carries, verified (`readViewer`), never an id
 * from the form. `register_instructor` is the same service-role call sign-up makes. It refuses an
 * account that already has any role and makes nothing when it refuses, so this cannot move a
 * student or an instructor, and a repeat does no harm.
 */
export async function setUpWorkspace(): Promise<WorkspaceState> {
  const viewer = await readViewer();
  if (viewer.status === "signed_out") {
    redirect(`/sign-in?next=${encodeURIComponent(WELCOME_PATH)}`);
  }
  if (viewer.role !== null) redirect(signedInHome(viewer.role));

  const service = createSupabaseServiceClient();
  const { error } = await service.rpc("register_instructor", {
    p_user: viewer.userId,
    p_workspace: workspaceName(viewer.displayName),
  });
  if (error && error.code !== ALREADY_HAS_A_ROLE) {
    console.error("[sign-up] making the teacher's workspace failed", { code: error.code });
    return { status: "error", error: WORKSPACE_FAILED };
  }
  // A role given meanwhile (a class joined in another tab) is that role's home to find.
  redirect(error ? "/" : DEFAULT_AFTER_SIGN_IN);
}
