import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { Icon } from "./Icon";

/**
 * The classes the back link wears, for a link component of the caller's own (`GuardedLink`), so
 * there is one back-link look in the app in place of three (#563).
 *
 * A 44px target, the accent ink (a link is interactive, §1), semibold and small so it sits above a
 * page title without competing with it, and a chevron that points the way. The chevron hangs a
 * little into the margin so the word lines up with the title under it. No underline until hover.
 */
export function backLinkClasses(): string {
  return (
    "tap-target -ml-1.5 inline-flex items-center gap-0.5 self-start text-sm font-semibold " +
    "text-accent-ink underline-offset-4 hover:underline"
  );
}

/** The chevron a back link opens with, for a caller that draws its own link around it. */
export function BackLinkMark() {
  return <Icon icon={ChevronLeft} />;
}

export type BackLinkProps = ComponentProps<typeof Link>;

/**
 * "Back to the library": the way up one level, above a page title (`PageHeader`'s `back`) or on
 * its own. The words name where it goes, never just "Back" (docs/glossary.md).
 */
export function BackLink({ className = "", children, ...rest }: BackLinkProps) {
  return (
    <Link className={`${backLinkClasses()} ${className}`.trim()} {...rest}>
      <BackLinkMark />
      <span>{children}</span>
    </Link>
  );
}
