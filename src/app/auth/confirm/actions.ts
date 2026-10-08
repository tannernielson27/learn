"use server";

import { redirect } from "next/navigation";
import { spendConfirmLink } from "@/lib/auth/confirm";
import {
  afterConfirming,
  endEarlierAccess,
  markEmailConfirmed,
} from "@/lib/auth/emailConfirmation";
import { confirmedDeps, earlierAccessDeps, signedInUserId } from "@/lib/supabase/emailConfirmed";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The "Continue to LeaRN" button on `/auth/confirm` (#305): the only place a sign-in link is
 * used. A POST, so a mail scanner that opens the link to inspect it spends nothing, and a Server
 * Function, so Next refuses a post whose Origin is not this site.
 */
export async function confirmSignIn(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  // Read before the link replaces it: who this browser was signed in as, if anyone.
  const before = await signedInUserId(supabase);
  const link = await spendConfirmLink(
    {
      token_hash: formData.get("token_hash"),
      type: formData.get("type"),
      next: formData.get("next"),
    },
    (params) => supabase.auth.verifyOtp(params),
  );
  // A link that worked is the proof the address is theirs; one that failed proves nothing.
  if (!link.ok) redirect(link.target);
  const confirmed = await markEmailConfirmed(confirmedDeps(supabase));
  // Confirmed from a browser that was not signed in to the account: whoever made it is shut out.
  await endEarlierAccess(confirmed, before, earlierAccessDeps(supabase));
  redirect(afterConfirming(confirmed, before, link.target));
}
