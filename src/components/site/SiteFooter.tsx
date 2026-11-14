import { TextLink, textLinkClasses } from "@/components/ui/TextLink";
import { Wordmark } from "./Wordmark";
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
 *
 * #563: on paper under a strong rule, with the wordmark and the line it stands for, so every
 * public page ends the way the landing page does.
 */
export function SiteFooter() {
  return (
    <footer className="mx-auto w-full max-w-wide px-5 sm:px-6 lg:px-8">
      <div className="grid gap-6 border-t-2 border-ink-1 py-8 text-sm text-ink-2 lg:grid-cols-12 lg:gap-8">
        <div className="flex flex-col gap-1 lg:col-span-4">
          <Wordmark className="self-start" />
          <p>Live learning for the Next Generation NCLEX.</p>
        </div>
        <nav aria-label="Footer" className="lg:col-span-5">
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
        <div className="flex flex-col gap-1 lg:col-span-3 lg:items-end lg:text-right">
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
