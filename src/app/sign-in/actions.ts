"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { DemoSignInState } from "@/components/auth/DemoSignIn";
import type { SignInState } from "@/components/auth/SignInForm";
import { readDemoAccount, signInToDemo } from "@/lib/auth/demoAccount";
import { parseSignInForm } from "@/lib/auth/signInForm";
import { takeSignInAttempt } from "@/lib/auth/signInRateLimit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const RATE_LIMITED = "Too many sign-in emails were asked for. Wait a minute, then try again.";
const SEND_FAILED = "The email could not be sent just now. Try again in a moment.";

/**
 * Emails a sign-in link. The link returns to /auth/confirm on this site; Supabase only sends it
 * if that URL is on the project's redirect allow-list, so a forged Host header cannot redirect.
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

  const confirmUrl = new URL("/auth/confirm", siteOrigin(requestHeaders));
  confirmUrl.searchParams.set("next", parsed.next);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.email,
    options: { emailRedirectTo: confirmUrl.toString(), shouldCreateUser: true },
  });

  if (error) {
    return { status: "error", error: error.status === 429 ? RATE_LIMITED : SEND_FAILED };
  }
  return { status: "sent", email: parsed.email };
}

/**
 * Signs in to the shared demo account with its server-only password, then follows the safe
 * `next`. Refuses when the demo is not configured, even if the button was forged.
 */
export async function signInAsDemo(
  _previous: DemoSignInState,
  formData: FormData,
): Promise<DemoSignInState> {
  const limit = takeSignInAttempt(await headers(), "demo");
  if (!limit.ok) return { status: "error", error: limit.error };

  const supabase = await createSupabaseServerClient();
  const result = await signInToDemo(readDemoAccount(), formData.get("next"), (credentials) =>
    supabase.auth.signInWithPassword(credentials),
  );
  if (!result.ok) return { status: "error", error: result.error };
  redirect(result.next);
}

function siteOrigin(requestHeaders: Headers): string {
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
