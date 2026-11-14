import { TextLink, textLinkClasses } from "@/components/ui/TextLink";
import {
  HELP_PATH,
  PRICING_PATH,
  PRIVACY_PATH,
  SUPPORT_MAILTO,
  TERMS_PATH,
} from "@/lib/site/links";
import { Wordmark } from "./Wordmark";

const LINKS = [
  { href: PRICING_PATH, label: "Pricing" },
  { href: HELP_PATH, label: "Help" },
  { href: TERMS_PATH, label: "Terms" },
  { href: PRIVACY_PATH, label: "Privacy" },
] as const;

/** A mail link wears a text link's classes; `next/link` is for pages, not for `mailto:`. */
function ContactLink() {
  return (
    <a href={SUPPORT_MAILTO} className={textLinkClasses({ size: "sm" })}>
      Contact
    </a>
  );
}

/**
 * The footer of the public pages (#522): the landing page, pricing, the terms, the privacy
 * policy, help, sign-in and sign-up. Never on a live session, the player, joining, the student
 * home, the library or the account pages, which have work of their own to show at the bottom.
 * The year is the one the page was rendered in, so a static page shows its build's.
 *
 * #563: the site's editorial close. A near-black rule, the wordmark and the line that says what
 * LeaRN is, the links beside them from 1024px, and the small print under a hairline.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto bg-surface-band">
      <div className="mx-auto w-full max-w-site px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col gap-6 border-t border-rule-strong pt-8 pb-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-2">
            <Wordmark />
            <p className="max-w-xs font-read text-lg leading-snug text-ink-2">
              Live learning for the Next Generation NCLEX.
            </p>
          </div>
          <nav aria-label="Footer">
            <ul className="-mx-1.5 flex flex-wrap items-center gap-x-4">
              {LINKS.map((link) => (
                <li key={link.href} className="px-1.5">
                  <TextLink href={link.href} size="sm">
                    {link.label}
                  </TextLink>
                </li>
              ))}
              <li className="px-1.5">
                <ContactLink />
              </li>
            </ul>
          </nav>
        </div>
        <div className="flex flex-col gap-1 border-t border-line py-5 text-sm text-ink-2 sm:flex-row sm:justify-between sm:gap-4">
          <p>Every patient shown in LeaRN is fictional.</p>
          <p>&copy; {new Date().getFullYear()} LeaRN</p>
        </div>
      </div>
    </footer>
  );
}

/** One quiet line for a signed-in page that has no site footer: the account page (#522). */
export function LegalLinks({ className = "" }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={className}>
      <ul className="-mx-1.5 flex flex-wrap items-center gap-x-4">
        <li className="px-1.5">
          <TextLink href={TERMS_PATH} size="sm">
            Terms
          </TextLink>
        </li>
        <li className="px-1.5">
          <TextLink href={PRIVACY_PATH} size="sm">
            Privacy
          </TextLink>
        </li>
        <li className="px-1.5">
          <ContactLink />
        </li>
      </ul>
    </nav>
  );
}
