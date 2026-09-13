import { z } from "zod";
import { safeNextPath } from "./nextPath";

export type SignInFormResult =
  { ok: true; email: string; next: string } | { ok: false; error: string };

export const SIGN_IN_EMAIL_ERROR =
  "Enter the email address you use for LeaRN, like name@school.edu.";

// 254 is the longest address SMTP allows.
const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** Reads the sign-in form on the server. The browser's own email check is only a convenience. */
export function parseSignInForm(formData: FormData): SignInFormResult {
  const email = formData.get("email");
  const next = formData.get("next");
  const parsed = emailSchema.safeParse(typeof email === "string" ? email : "");
  if (!parsed.success) return { ok: false, error: SIGN_IN_EMAIL_ERROR };
  return {
    ok: true,
    email: parsed.data,
    next: safeNextPath(typeof next === "string" ? next : null),
  };
}
