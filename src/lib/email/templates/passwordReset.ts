/**
 * The reset-password email Supabase Auth sends when its public `/recover` endpoint is called.
 * The app never calls it ("Forgot your password?" sends a sign-in link instead), but anyone with
 * the publishable key can, so the hosted default (unbranded, linking to supabase.co) reached real
 * inboxes and looked like phishing. This version resets nothing: it points at the sign-in page.
 *
 * Rendered to `supabase/templates/recovery.html`, which `supabase/config.toml` points the local
 * stack at and docs/05 §7.7 step 3 pastes into each hosted project.
 */
import { renderEmailDocument, trustedHtml, type EmailLayout, type EmailText } from "../layout";

/** Supabase fills this in with the project's Site URL, the app's canonical origin. */
const SIGN_IN = trustedHtml("{{ .SiteURL }}/sign-in");

export const PASSWORD_RESET_SUBJECT = "Reset your LeaRN password";

export function passwordResetEmail(signInLink: EmailText): EmailLayout {
  return {
    title: PASSWORD_RESET_SUBJECT,
    heading: "Reset your LeaRN password",
    paragraphs: [
      "On the sign-in page, choose Forgot your password? and we will email you a sign-in link. Once you are in, you can set a new password.",
    ],
    action: { label: "Go to sign in", href: signInLink, text: signInLink },
    notes: ["If you did not ask to reset your password, ignore this email. Nothing has changed."],
    footer:
      "Sent by LeaRN, an NCLEX practice app, because someone asked to reset the password for this address.",
  };
}

/** The contents of `supabase/templates/recovery.html`. */
export function renderPasswordResetTemplate(): string {
  return renderEmailDocument(passwordResetEmail(SIGN_IN));
}
