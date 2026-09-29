import { parseSignInForm } from "./signInForm";
import type { SignInRateLimitResult } from "./signInRateLimit";

export const EMAIL_CODE_FORMAT = "Enter the code from the email. It is 6 to 10 digits.";
/** One answer for a wrong, expired or used code, and for an address with no account (#139). */
export const EMAIL_CODE_FAILED =
  "That code did not work. Check it against the newest email, or ask for a new one.";

// Supabase's email code is 6 digits by default and configurable up to 10.
const CODE = /^\d{6,10}$/;

export type EmailCodeForm =
  { ok: true; email: string; code: string; next: string } | { ok: false; error: string };

/** Reads the code form: the address the code was sent to, the code, and where to go after. */
export function parseEmailCodeForm(formData: FormData): EmailCodeForm {
  const signIn = parseSignInForm(formData);
  if (!signIn.ok) return signIn;
  const raw = formData.get("code");
  const code = typeof raw === "string" ? raw.replace(/[\s-]/g, "") : "";
  if (!CODE.test(code)) return { ok: false, error: EMAIL_CODE_FORMAT };
  return { ok: true, email: signIn.email, code, next: signIn.next };
}

/** What `verifyEmailCode` needs, injected so it can be tested. */
export interface EmailCodeDeps {
  /** Counts one try against the caller and the address (`takeSignInCode`). */
  take(email: string): Promise<SignInRateLimitResult>;
  /** `supabase.auth.verifyOtp` on the cookie client, so the session lands on this device. */
  verify(params: { email: string; token: string; type: "email" }): Promise<{ error: unknown }>;
}

/**
 * Signs in with the one-time code from the email (#306), for someone who asked on one device and
 * opened the email on another. A try is counted only once the form reads, and before Supabase is
 * asked. Every refusal from Supabase is the same message, and none says whether the address has
 * an account. The log gets the status and code, never the address or the code.
 */
export async function verifyEmailCode(
  formData: FormData,
  deps: EmailCodeDeps,
): Promise<{ ok: true; next: string } | { ok: false; error: string }> {
  const parsed = parseEmailCodeForm(formData);
  if (!parsed.ok) return parsed;

  const limit = await deps.take(parsed.email);
  if (!limit.ok) return limit;

  try {
    const { error } = await deps.verify({ email: parsed.email, token: parsed.code, type: "email" });
    if (!error) return { ok: true, next: parsed.next };
    const { status, code } = error as { status?: number; code?: string };
    console.error("[sign-in] Supabase did not accept a sign-in code", { status, code });
  } catch (error) {
    console.error("[sign-in] verifying a sign-in code failed", {
      error: error instanceof Error ? error.name : "unknown",
    });
  }
  return { ok: false, error: EMAIL_CODE_FAILED };
}
