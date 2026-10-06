import { parseSignInForm } from "./signInForm";
import type { SignInRateLimitResult } from "./signInRateLimit";

import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  PASSWORD_TOO_LONG,
  PASSWORD_TOO_SHORT,
} from "./passwordRules";

export { PASSWORD_TOO_LONG, PASSWORD_TOO_SHORT };
export const PASSWORD_MISSING = "Enter your password.";
/** One answer for a wrong password, an address with no account, and an account with no password. */
export const PASSWORD_SIGN_IN_FAILED =
  "That email and password do not match. Try again, or get a sign-in link by email.";

export type NewPasswordResult = { ok: true; password: string } | { ok: false; error: string };

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Checks a password someone is choosing. Length is the only rule: a long phrase is a good
 * password, and rules about symbols mostly produce `Password1!`. Never trimmed, since a space is
 * a character like any other.
 */
export function checkNewPassword(value: FormDataEntryValue | null): NewPasswordResult {
  const password = typeof value === "string" ? value : "";
  // Counted in characters as the person sees them, so an accented letter is one, not two.
  if (Array.from(password).length < PASSWORD_MIN_LENGTH) {
    return { ok: false, error: PASSWORD_TOO_SHORT };
  }
  if (byteLength(password) > PASSWORD_MAX_BYTES) return { ok: false, error: PASSWORD_TOO_LONG };
  return { ok: true, password };
}

export type PasswordSignInForm =
  { ok: true; email: string; password: string; next: string } | { ok: false; error: string };

/** Reads the sign-in form's address, password and safe `next`. */
export function parsePasswordSignInForm(formData: FormData): PasswordSignInForm {
  const signIn = parseSignInForm(formData);
  if (!signIn.ok) return signIn;
  const raw = formData.get("password");
  const password = typeof raw === "string" ? raw : "";
  if (password.length === 0) return { ok: false, error: PASSWORD_MISSING };
  // Nothing longer was ever accepted as a password, so there is nothing to ask Supabase.
  if (byteLength(password) > PASSWORD_MAX_BYTES) {
    return { ok: false, error: PASSWORD_SIGN_IN_FAILED };
  }
  return { ok: true, email: signIn.email, password, next: signIn.next };
}

/** What `signInWithPassword` needs, injected so it can be tested. */
export interface PasswordSignInDeps {
  /** Counts one try against the caller and the address (`takeSignInPassword`). */
  take(email: string): Promise<SignInRateLimitResult>;
  /** `supabase.auth.signInWithPassword` on the cookie client, so the session lands here. */
  signIn(credentials: { email: string; password: string }): Promise<{ error: unknown }>;
}

/**
 * Signs in with an email address and a password. A try is counted once the form reads and before
 * Supabase is asked. Every refusal from Supabase is the same message, so the answer never says
 * whether the address has an account (#139). The log gets the status and code, never the address.
 */
export async function signInWithPassword(
  formData: FormData,
  deps: PasswordSignInDeps,
): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  const parsed = parsePasswordSignInForm(formData);
  if (!parsed.ok) return parsed;

  const limit = await deps.take(parsed.email);
  if (!limit.ok) return limit;

  try {
    const { error } = await deps.signIn({ email: parsed.email, password: parsed.password });
    if (!error) return { ok: true, next: parsed.next };
    const { status, code } = error as { status?: number; code?: string };
    // A wrong password is the ordinary case and not worth a line; anything else may be an outage.
    if (code !== "invalid_credentials") {
      console.error("[sign-in] Supabase did not accept a password sign-in", { status, code });
    }
  } catch (error) {
    console.error("[sign-in] signing in with a password failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
  return { ok: false, error: PASSWORD_SIGN_IN_FAILED };
}

/** The slice of `supabase.auth` that `saveNewPassword` needs, injected so it can be tested. */
export interface SavePasswordDeps {
  /** `supabase.auth.updateUser` on the signed-in person's own client. */
  update(attributes: { password: string }): Promise<{ error: unknown }>;
  /** `supabase.auth.signOut({ scope: "others" })`: every session but this one. */
  signOutOthers(): Promise<{ error: unknown }>;
}

export const PASSWORD_WEAK =
  "That password is too easy to guess. Choose a longer or less common one.";
export const PASSWORD_REAUTHENTICATE =
  "For your security, sign out, sign in again with an emailed link, then choose your password.";
export const PASSWORD_NOT_SAVED = "Your password could not be saved just now. Try again.";

/**
 * Saves the signed-in person's new password, then signs out their other sessions: whoever chose
 * this password is the only one who should still be signed in, which is the point of changing it
 * after an account was shared or guessed.
 */
export async function saveNewPassword(
  value: FormDataEntryValue | null,
  deps: SavePasswordDeps,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const checked = checkNewPassword(value);
  if (!checked.ok) return checked;

  try {
    const { error } = await deps.update({ password: checked.password });
    if (error) {
      const { status, code } = error as { status?: number; code?: string };
      // Choosing the password the account already has changes nothing and is not a failure.
      if (code !== "same_password") {
        if (code === "weak_password") return { ok: false, error: PASSWORD_WEAK };
        if (code === "reauthentication_needed")
          return { ok: false, error: PASSWORD_REAUTHENTICATE };
        console.error("[account] Supabase did not save a password", { status, code });
        return { ok: false, error: PASSWORD_NOT_SAVED };
      }
    }
    const others = await deps.signOutOthers();
    if (others.error) {
      const { status, code } = others.error as { status?: number; code?: string };
      // The password is saved; only the other sessions are still open, until they expire.
      console.error("[account] other sessions were not signed out", { status, code });
    }
    return { ok: true };
  } catch (error) {
    console.error("[account] saving a password failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { ok: false, error: PASSWORD_NOT_SAVED };
  }
}
