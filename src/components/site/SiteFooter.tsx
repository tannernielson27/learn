import { TextLink, textLinkClasses } from "@/components/ui/TextLink";
import {
  HELP_PATH,
  PRICING_PATH,
  PRIVACY_PATH,
  SUPPORT_MAILTO,
  TERMS_PATH,
} from "@/lib/site/links";

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
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-wide flex-col gap-2 px-5 py-6 text-sm text-ink-2 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
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
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
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
