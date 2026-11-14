"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/help", label: "Help" },
  { href: "/help/instructor", label: "Teacher guide" },
  { href: "/help/items", label: "Question guide" },
] as const;

// The site header's link, with the page you are on in ink and underlined (never colour alone).
const LINK =
  "tap-target inline-flex items-center rounded-md px-3 text-sm font-semibold text-ink-2 " +
  "underline-offset-[6px] decoration-rule-strong transition-colors duration-fast " +
  "hover:bg-surface-2 hover:text-ink-1 aria-[current=page]:text-ink-1 aria-[current=page]:underline";

/**
 * The help pages' own navigation (#269), a row under the site header (#563). A client component
 * only to mark the current page.
 */
export function HelpNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Help" className="border-b border-line">
      <ul className="mx-auto flex w-full max-w-site flex-wrap items-center gap-1 px-1 sm:px-3 lg:px-7">
        {NAV.map((entry) => (
          <li key={entry.href}>
            <Link
              href={entry.href}
              aria-current={pathname === entry.href ? "page" : undefined}
              className={LINK}
            >
              {entry.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
