"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { DemoSignInState } from "@/components/auth/DemoSignIn";
import type { SignInState } from "@/components/auth/SignInForm";
import { readDemoAccount, signInToDemo } from "@/lib/auth/demoAccount";
import { parseSignInForm } from "@/lib/auth/signInForm";
import {
  SIGN_IN_RATE_LIMITED,
  takeSignInAddress,
  takeSignInAttempt,
} from "@/lib/auth/signInRateLimit";
import { siteOrigin } from "@/lib/http/siteOrigin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const SEND_FAILED = "The email could not be sent just now. Try again in a moment.";

/**
 * What Supabase answers when `shouldCreateUser` is false and the address has no account: GoTrue
 * looks the user up, does not find one, and returns 422 `otp_disabled` ("Signups not allowed for
 * otp") having sent nothing. Matched on the code, which is the stable half of that answer; the
 * sentence is only a fallback for a GoTrue old enough to reply without one.
 *
 * Deliberately this narrow. Every other error is about the deployment or about Supabase, not
 * about the address, so swallowing those too would hide an outage behind "check your email".
 */
function isAddressWithoutAccount(error: { code?: string; message?: string }): boolean {
  if (error.code !== undefined) return error.code === "otp_disabled";
  return error.message === "Signups not allowed for otp";
}

/** The single answer to every request that was accepted — and to every one quietly refused. */
function sent(email: string): SignInState {
  return { status: "sent", email };
}

/**
 * Emails a sign-in link. The link returns to /auth/confirm on this site; Supabase only sends it
 * if that URL is on the project's redirect allow-list, so a forged Host header cannot redirect.
 *
 * Three paths through this function end in the same `sent` result, and that is the whole design
 * (#139): a link really sent, an address whose five-minute budget is already spent, and an
 * address with no account are indistinguishable to the caller. Telling them apart is exactly the
 * account-existence oracle that `shouldCreateUser: false` would otherwise open.
 */
export async function requestSignInLink(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = parseSignInForm(formData);
  if (!parsed.ok) return { status: "error", error: parsed.error };

  // Counted here, where the request is about to reach Supabase; an address that never gets past
  // the form spends nothing.
  const requestHeaders = await headers();
  const limit = takeSignInAttempt(requestHeaders, "email");
  if (!limit.ok) return { status: "error", error: limit.error };

  // Then the recipient's own budget, spent whoever asked. After the per-IP limit on purpose: a
  // request already refused above never reaches Supabase, so it must not spend a third party's
  // budget either. A refusal here is silent — see `takeSignInAddress`.
  if (!takeSignInAddress(parsed.email)) return sent(parsed.email);

  const confirmUrl = new URL("/auth/confirm", siteOrigin(requestHeaders));
  confirmUrl.searchParams.set("next", parsed.next);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.email,
    // Sign-up is not self-serve: the owner creates author accounts in the Supabase dashboard.
    // That decision is most of #139 — with this off, Supabase will not mail an address that has
    // no account at all, so nobody's inbox can be filled with links to an account they lack.
    options: { emailRedirectTo: confirmUrl.toString(), shouldCreateUser: false },
  });

  if (error) {
    // The one error that must leave no trace. An answer of its own here would say "this address
    // has an account", a worse hole than the flooding being closed, so it gets the answer a real
    // send gets. No log line either: an unknown address is an ordinary event now, and logging it
    // would only build the list the prober was after.
    if (isAddressWithoutAccount(error)) return sent(parsed.email);
    // Everything else turns on the deployment rather than the address, so it can be said out
    // loud, and belongs in the server log where an outage is meant to be visible. The address
    // stays out of the log; the status and the code are what say what broke.
    console.error("[sign-in] Supabase refused to send a sign-in link", {
      status: error.status,
      code: error.code,
    });
    // Supabase's own limit counts this server's address, so its 429 can arrive without this
    // caller having reached the limit above. One sentence for both, so neither says which.
    return { status: "error", error: error.status === 429 ? SIGN_IN_RATE_LIMITED : SEND_FAILED };
  }
  return sent(parsed.email);
}

/**
 * Signs in to the shared demo account with its server-only password, then follows the safe
 * `next`. Refuses when the demo is not configured, even if the button was forged.
 */
export async function signInAsDemo(
  _previous: DemoSignInState,
  formData: FormData,
): Promise<DemoSignInState> {
  // Before the demo account is even read: a deployment with the demo turned off should not
  // answer a scripted post any differently from one with it turned on.
  const limit = takeSignInAttempt(await headers(), "demo");
  if (!limit.ok) return { status: "error", error: limit.error };

  const supabase = await createSupabaseServerClient();
  const result = await signInToDemo(readDemoAccount(), formData.get("next"), (credentials) =>
    supabase.auth.signInWithPassword(credentials),
  );
  if (!result.ok) return { status: "error", error: result.error };
  redirect(result.next);
}
