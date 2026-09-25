/**
 * The sign-in email, which Supabase Auth sends itself (it also carries class-invite sign-ins).
 * Supabase cannot import this module, so it is rendered to `supabase/templates/magic_link.html`,
 * which `supabase/config.toml` points the local stack at and docs/05 §7.7 step 3 pastes into each
 * hosted project. `magicLink.test.ts` fails when the committed file and this module disagree.
 *
 * Supabase sends this one as HTML only; the app has no say over its plain-text part.
 */
import { renderEmailDocument, trustedHtml, type EmailLayout, type EmailText } from "../layout";

/**
 * Supabase fills these in when it sends. The link sends a `token_hash` to `/auth/confirm` (the
 * redirect the app asks for), so it works on a phone the link was not requested from. Keep it
 * exactly as it is: e2e/mailbox.ts finds the link by its `/auth/confirm` path.
 */
const HREF = trustedHtml("{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email");
const HREF_TEXT = trustedHtml("{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email");

export const MAGIC_LINK_SUBJECT = "Sign in to LeaRN";

/** The sign-in email around `link`: Supabase's placeholders, or a sample URL for the preview. */
export function magicLinkEmail(link: EmailText, linkText: EmailText = link): EmailLayout {
  return {
    title: MAGIC_LINK_SUBJECT,
    heading: "Sign in to LeaRN",
    paragraphs: [
      "Use the button below to sign in. It takes you straight to your classes, whether you teach them or are joining one.",
    ],
    action: { label: "Sign in", href: link, text: linkText },
    notes: [
      "The link works once and expires in an hour. You can open it on any device, such as your phone in class. If it has expired, ask for a new one on the sign-in page.",
      "If you did not ask to sign in, you can ignore this email. Nobody can sign in without the link.",
    ],
    footer:
      "Sent by LeaRN, an NCLEX practice app, because someone entered this address on its sign-in page.",
  };
}

/** The contents of `supabase/templates/magic_link.html`. */
export function renderMagicLinkTemplate(): string {
  return renderEmailDocument(magicLinkEmail(HREF, HREF_TEXT));
}
