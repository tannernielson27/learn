"use server";

import { redirect } from "next/navigation";
import { confirmLink } from "@/lib/auth/confirm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The "Continue to LeaRN" button on `/auth/confirm` (#305): the only place a sign-in link is
 * used. A POST, so a mail scanner that opens the link to inspect it spends nothing, and a Server
 * Function, so Next refuses a post whose Origin is not this site.
 */
export async function confirmSignIn(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const target = await confirmLink(
    {
      token_hash: formData.get("token_hash"),
      type: formData.get("type"),
      next: formData.get("next"),
    },
    (params) => supabase.auth.verifyOtp(params),
  );
  redirect(target);
}
