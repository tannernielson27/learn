"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DEFAULT_AFTER_SIGN_IN } from "@/lib/auth/nextPath";
import { betaPassPath, type RedeemState } from "@/lib/betaPass/link";
import { redeemAsSignedIn } from "@/lib/betaPass/redeem";
import { takeBetaPassAttempt } from "@/lib/betaPass/redeemLimit";
import { redeemBetaPass } from "@/lib/supabase/betaPasses";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * "Accept" on `/b/<token>` (#520). Bound to the token by the page; the form state and data React
 * passes after it are not read. A Server Function, so opening the link redeems nothing, and Next
 * refuses a post whose Origin is not this site.
 *
 * The account is the one this request's session belongs to, asked of Supabase Auth
 * (`auth.getUser()`), never an id the request carries. `redeem_beta_pass` is granted to the
 * service role only, and checks everything else itself. Success goes straight to authoring.
 */
export async function acceptFreeAccess(token: string): Promise<RedeemState> {
  const requestHeaders = await headers();
  const supabase = await createSupabaseServerClient();
  const service = createSupabaseServiceClient();

  const outcome = await redeemAsSignedIn(token, {
    allow: () => takeBetaPassAttempt(requestHeaders),
    currentUser: async () => {
      const { data, error } = await supabase.auth.getUser();
      return error ? null : (data.user?.id ?? null);
    },
    redeem: (userId, candidate) => redeemBetaPass(service, userId, candidate),
  });

  // Outside any try, because redirect() works by throwing.
  if (outcome.status === "redeemed") redirect(DEFAULT_AFTER_SIGN_IN);
  // Signed out meanwhile: the page knows what to offer a visitor.
  if (outcome.status === "signed_out") redirect(betaPassPath(token));
  return outcome;
}
