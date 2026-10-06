"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { DemoSignInState } from "@/components/auth/DemoSignIn";
import type { EmailCodeState } from "@/components/auth/EmailCodeForm";
import type { PasswordSignInState } from "@/components/auth/PasswordSignInForm";
import type { SignInState } from "@/components/auth/SignInForm";
import { readDemoAccount, signInToDemo } from "@/lib/auth/demoAccount";
import type { ConfirmEmailState } from "@/components/auth/ConfirmEmailBanner";
import { verifyEmailCode } from "@/lib/auth/emailCode";
import { isEmailUnconfirmed, markEmailConfirmed } from "@/lib/auth/emailConfirmation";
import { sendConfirmationLink } from "@/lib/auth/inviteSignUp";
import { signInWithPassword } from "@/lib/auth/password";
import { takeSignInPassword } from "@/lib/auth/passwordLimit";
import { takeSignInCode } from "@/lib/auth/signInCodeLimit";
import { parseSignInForm, SIGN_IN_EMAIL_ERROR } from "@/lib/auth/signInForm";
import {
  signInAddressCeilingRefusals,
  takeSignInAddress,
  takeSignInAttempt,
} from "@/lib/auth/signInRateLimit";
import { canonicalSiteOrigin } from "@/lib/http/siteOrigin";
import { confirmedDeps } from "@/lib/supabase/emailConfirmed";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/** The single answer to every request that was accepted — and to every one quietly refused. */
function sent(email: string): SignInState {
  return { status: "sent", email };
}

/**
 * Emails a sign-in link. The link returns to /auth/confirm on the canonical origin, never one the
 * request names, so a forged Host header cannot redirect it.
 *
 * Once the form has been read and the caller counted, every path out of this function is the
 * same `sent` result, and that is the whole design (#139). A link really sent, an address whose
 * budget or ceiling is spent, an address with no account, a Supabase outage: the caller cannot
 * tell any of them from any other. The rule is blunt on purpose — *no* answer from Supabase is
 * ever shown — because a rule that shows some answers has to decide which, and that decision is
 * the account-existence oracle. Whether an address has an account is Supabase's to know and
 * nobody's to ask.
 *
 * The cost, stated plainly: a genuine outage now looks to the person like a link that is on its
 * way. It is visible only in the log below. That is why the log line exists and why it fires on
 * every failure, not on the ones some function thought worth reporting.
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
  const limit = await takeSignInAttempt(requestHeaders, "email");
  if (!limit.ok) return { status: "error", error: limit.error };

  // Then the recipient's two counters. After the per-IP limit on purpose: a request already
  // refused above never reaches Supabase, so it must not spend anything of the recipient's
  // either. Every refusal is silent, including the shared store failing to answer, which the
  // limiter has already logged — see `takeSignInAddress`.
  const decision = await takeSignInAddress(requestHeaders, parsed.email);
  if (decision !== "send") {
    // The ceiling refusing means one address is being asked for from several callers at once,
    // which is what a lockout campaign looks like and what an operator needs to be able to see.
    // A running total says that much and no more; the address stays out, because who is being
    // targeted is exactly what must not leak. A caller merely repeating itself is the ordinary
    // case and is not worth a line.
    if (decision === "over-address-ceiling") {
      console.warn("[sign-in] an address reached the deployment-wide ceiling", {
        ceilingRefusals: signInAddressCeilingRefusals(),
      });
    }
    return sent(parsed.email);
  }

  // The same origin a class invite's link uses (#304), so both land on the host Supabase's
  // allow-list names and the session cookie is set where the person will keep using the app.
  const confirmUrl = new URL("/auth/confirm", canonicalSiteOrigin(requestHeaders));
  confirmUrl.searchParams.set("next", parsed.next);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.email,
    // Sign-up is not self-serve: the owner creates author accounts in the Supabase dashboard.
    // That decision is most of #139 — with this off, Supabase will not mail an address that has
    // no account at all, so nobody's inbox can be filled with links to an account they lack.
    options: { emailRedirectTo: confirmUrl.toString(), shouldCreateUser: false },
  });

  // Every failure goes to the log and none of it to the caller. Unconditional by design: the
  // alternative is a list of error codes that are safe to show, and that list rots. `otp_disabled`
  // is the no-account answer today, but `AuthError.code` is typed `ErrorCode | (string & {})`, so
  // GoTrue renaming it would still compile and would silently reopen the oracle. Nothing here
  // reads the code to decide what to return, so nothing here can rot that way. 429 is the same
  // story: Supabase refuses a second link to one address inside sixty seconds, which depends on
  // the address and so could never have been shown either.
  //
  // The address never reaches the log. The status and the code are what say what broke, and an
  // operator watching for an outage wants those, not a list of who tried to sign in.
  if (error) {
    console.error("[sign-in] Supabase did not send a sign-in link", {
      status: error.status,
      code: error.code,
    });
  }
  return sent(parsed.email);
}

/**
 * Signs in with an email address and a password, then follows the safe `next`. Counted per caller
 * and per address before Supabase is asked; see `signInWithPassword` for why every refusal reads
 * the same.
 */
export async function signInWithEmailPassword(
  _previous: PasswordSignInState,
  formData: FormData,
): Promise<PasswordSignInState> {
  const requestHeaders = await headers();
  const supabase = await createSupabaseServerClient();
  const result = await signInWithPassword(formData, {
    take: (email) => takeSignInPassword(requestHeaders, email),
    signIn: (credentials) => supabase.auth.signInWithPassword(credentials),
  });
  if (!result.ok) {
    const field = result.error === SIGN_IN_EMAIL_ERROR ? "email" : "password";
    return { status: "error", error: result.error, field };
  }
  // Outside any try, because redirect() works by throwing.
  redirect(result.next);
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
  const limit = await takeSignInAttempt(await headers(), "demo");
  if (!limit.ok) return { status: "error", error: limit.error };

  const supabase = await createSupabaseServerClient();
  const result = await signInToDemo(readDemoAccount(), formData.get("next"), (credentials) =>
    supabase.auth.signInWithPassword(credentials),
  );
  if (!result.ok) return { status: "error", error: result.error };
  redirect(result.next);
}

/**
 * Signs in with the one-time code from the sign-in email (#306), on the device the code is typed
 * on. Shared by the sign-in page and the class invite page. Counted per caller and per address
 * before Supabase is asked; see `verifyEmailCode` for why every refusal reads the same.
 */
export async function verifySignInCode(
  _previous: EmailCodeState,
  formData: FormData,
): Promise<EmailCodeState> {
  const requestHeaders = await headers();
  const supabase = await createSupabaseServerClient();
  const result = await verifyEmailCode(formData, {
    take: (email) => takeSignInCode(requestHeaders, email),
    verify: (params) => supabase.auth.verifyOtp(params),
  });
  if (!result.ok) return { status: "error", error: result.error };
  // The code came from their inbox, which is the proof the address is theirs.
  await markEmailConfirmed(confirmedDeps(supabase));
  // Outside any try, because redirect() works by throwing.
  redirect(result.next);
}

/**
 * Sends the confirmation link again, from the banner a not-yet-confirmed account sees. Signed-in
 * only, and to the account's own address only, counted like any other emailed link. The answer is
 * always `sent`, as it is for every link (#139): whether the email left is the log's to say.
 */
export async function resendConfirmation(): Promise<ConfirmEmailState> {
  const supabase = await createSupabaseServerClient();
  const claims = (await supabase.auth.getClaims()).data?.claims;
  const email = typeof claims?.email === "string" ? claims.email : null;
  if (!email || !isEmailUnconfirmed(claims)) return { status: "sent" };

  const requestHeaders = await headers();
  const limit = await takeSignInAttempt(requestHeaders, "email");
  if (!limit.ok) return { status: "error", error: limit.error };
  if ((await takeSignInAddress(requestHeaders, email)) !== "send") return { status: "sent" };

  const service = createSupabaseServiceClient();
  await sendConfirmationLink(email, canonicalSiteOrigin(requestHeaders), (params) =>
    service.auth.signInWithOtp({
      email: params.email,
      options: { emailRedirectTo: params.redirectTo, shouldCreateUser: false },
    }),
  );
  return { status: "sent" };
}
