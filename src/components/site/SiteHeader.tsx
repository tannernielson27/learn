import Link from "next/link";
import { HELP_PATH, PRICING_PATH } from "@/lib/site/links";
import { Wordmark } from "./Wordmark";

export interface SiteHeaderLink {
  href: string;
  label: string;
}

/** Pricing and Help, on every public page. */
export const SITE_LINKS: readonly SiteHeaderLink[] = [
  { href: PRICING_PATH, label: "Pricing" },
  { href: HELP_PATH, label: "Help" },
];

export interface SiteHeaderProps {
  /** What follows Pricing and Help: Sign in on the business pages. */
  extra?: readonly SiteHeaderLink[];
}

const linkClass =
  "tap-target inline-flex items-center rounded-md px-3 text-sm font-semibold text-brand-ink-2 " +
  "transition-colors duration-fast hover:bg-brand-surface-raised hover:text-brand-ink";

/**
 * The public pages' bar (#563): the wordmark home and, on the right, Pricing, Help and whatever
 * the page adds. Drawn on the navy band, so it reads as the top of the lit hall on the landing
 * page and as the same front door on pricing, the terms and the privacy policy. It has no
 * surface of its own: the band behind it is the page's, so the landing hero runs on under it.
 */
export function SiteHeader({ extra = [] }: SiteHeaderProps) {
  const links = [...SITE_LINKS, ...extra];
  return (
    <header className="mx-auto flex w-full max-w-wide items-center gap-4 px-4 py-2 sm:px-6 lg:px-8">
      <Wordmark tone="brand" />
      <nav aria-label="Site" className="ml-auto">
        <ul className="-mr-3 flex items-center">
          {links.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className={linkClass}>
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
