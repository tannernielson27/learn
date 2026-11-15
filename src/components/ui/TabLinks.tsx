import Link from "next/link";
import { tabClasses } from "./tabClasses";

export interface TabLink {
  href: string;
  label: string;
  /** The page this link is on: drawn as the selected tab and announced as `aria-current`. */
  current: boolean;
}

export interface TabLinksProps {
  /** The navigation's accessible name, e.g. "Report views". */
  label: string;
  links: readonly TabLink[];
  className?: string;
}

/**
 * `Tabs`' strip for views that are pages of their own (#565): each tab is a link, so switching
 * needs no script, and the view survives a reload or a shared link. A `nav` of links, not a
 * `tablist`: a screen reader hears where each one goes, and the current one as the current page.
 * A strip wider than its column scrolls sideways inside itself.
 */
export function TabLinks({ label, links, className = "" }: TabLinksProps) {
  return (
    <nav aria-label={label} className={`border-b border-line ${className}`.trim()}>
      <ul className="no-scrollbar -my-1 flex snap-x snap-mandatory gap-1 overflow-x-auto py-1">
        {links.map((link) => (
          <li key={link.href} className="flex">
            <Link
              href={link.href}
              aria-current={link.current ? "page" : undefined}
              className={tabClasses(link.current)}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
