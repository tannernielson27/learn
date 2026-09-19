import { z } from "zod";
import { safeNextPath } from "./nextPath";

export interface DemoAccount {
  email: string;
  password: string;
}

interface RawDemoAccount {
  email: string | undefined;
  password: string | undefined;
}

/** The slice of `supabase.auth.signInWithPassword` this step needs; injected so it can be tested. */
export type SignInWithPassword = (credentials: DemoAccount) => Promise<{ error: unknown }>;

export type DemoSignInResult = { ok: true; next: string } | { ok: false; error: string };

export const DEMO_UNAVAILABLE = "The demo account is not available on this site.";
export const DEMO_FAILED = "The demo account could not sign in just now. Try again in a moment.";

const MIN_PASSWORD_LENGTH = 8;
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/**
 * The shared demo account, or null when it is not configured, which hides the button. Both values
 * are server-only (no NEXT_PUBLIC_ prefix), so the password never reaches a browser.
 */
export function readDemoAccount(
  raw: RawDemoAccount = {
    email: process.env.DEMO_ACCOUNT_EMAIL,
    password: process.env.DEMO_ACCOUNT_PASSWORD,
  },
): DemoAccount | null {
  const email = emailSchema.safeParse(raw.email ?? "");
  const password = raw.password ?? "";
  if (!email.success || password.length < MIN_PASSWORD_LENGTH) return null;
  return { email: email.data, password };
}

/**
 * Signs in to the demo account and returns where to send the person. Any failure gives a generic
 * reason, never Supabase's message, so the response says nothing about the account.
 */
export async function signInToDemo(
  account: DemoAccount | null,
  next: FormDataEntryValue | null,
  signIn: SignInWithPassword,
): Promise<DemoSignInResult> {
  if (!account) return { ok: false, error: DEMO_UNAVAILABLE };
  try {
    const { error } = await signIn({ email: account.email, password: account.password });
    if (error) return { ok: false, error: DEMO_FAILED };
  } catch {
    return { ok: false, error: DEMO_FAILED };
  }
  return { ok: true, next: safeNextPath(typeof next === "string" ? next : null) };
}
