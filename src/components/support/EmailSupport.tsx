import { textLinkClasses } from "@/components/ui/TextLink";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site/links";

/**
 * A mailto link with the error's reference already in the subject and body, so someone does not
 * have to copy it across (#568). Without a reference, the plain address.
 */
export function supportMailto(reference?: string): string {
  if (!reference) return SUPPORT_MAILTO;
  const subject = `Problem with LeaRN (reference ${reference})`;
  const body = `Reference: ${reference}\n\nWhat happened:\n`;
  return `${SUPPORT_MAILTO}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Under the ways to tell us, on an error screen: what the reference shown below is for. */
export const REFERENCE_NOTE = "Include the reference below, so we can find what went wrong.";

/**
 * The support address, offered on every error screen and wherever the form cannot be (#568):
 * "Email us:" and the address, after the form's button "Or email us:". On an error screen, a line
 * after it asks for the reference shown below, and the email arrives with it already filled in.
 *
 * The address is a standalone link on its own line, a 44px target like every other way out of an
 * error screen (`e2e/statesGallery.spec.ts`). No dialog and no server call, so the global error
 * page, which must stay light, can use it.
 */
export function EmailSupport({ lead, reference }: { lead?: string; reference?: string }) {
  // "Still stuck? Email us" starts a sentence; "Or email us" carries one on.
  const sentence = !lead
    ? "Email us:"
    : /[.?!:]$/.test(lead)
      ? `${lead} Email us:`
      : `${lead} email us:`;
  return (
    <div className="flex flex-col items-start">
      <p className="text-sm text-ink-2">{sentence}</p>
      <a href={supportMailto(reference)} className={textLinkClasses({ size: "sm" })}>
        {SUPPORT_EMAIL}
      </a>
      {reference ? <p className="text-sm text-ink-2">{REFERENCE_NOTE}</p> : null}
    </div>
  );
}
