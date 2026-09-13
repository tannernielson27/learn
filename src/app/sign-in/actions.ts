"use server";

import { headers } from "next/headers";
import type { SignInState } from "@/components/auth/SignInForm";
import { parseSignInForm } from "@/lib/auth/signInForm";
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

  const confirmUrl = new URL("/auth/confirm", await siteOrigin());
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

async function siteOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
