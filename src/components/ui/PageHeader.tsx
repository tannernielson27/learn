import type { ReactNode } from "react";
import { BackLink } from "./BackLink";

/**
 * A page title's classes (#563, docs/04 §11 "Titles"): the editorial `.display-section` serif,
 * wrapping anywhere a long quiz name needs to so it never pushes the page sideways at 320px, with
 * the last line kept from standing alone. Exported for the screens that still set their own h1
 * (the copied `font-read text-display leading-tight break-words text-ink-1`); each moves to
 * `PageHeader` in its own PR.
 */
export const PAGE_TITLE_CLASSES = "display-section min-w-0 wrap-anywhere text-pretty";

export type PageHeaderLevel = 1 | 2;

export interface PageHeaderProps {
  /** The page's name: "Library", or a quiz's own name. */
  title: ReactNode;
  /** One or two sentences under the title, at reading width. */
  lead?: ReactNode;
  /** The page's main action: one `Button`, or a link wearing `buttonClasses`. */
  action?: ReactNode;
  /** The way up one level, above the title: `{ href: "/author", label: "Back to the library" }`. */
  back?: { href: string; label: string };
  /** 1 (the default) for a page; 2 where the header heads a part of a page, as in the gallery. */
  level?: PageHeaderLevel;
  /** The heading's id, for a region named by it. */
  titleId?: string;
  className?: string;
}

/**
 * The top of an app page (#563, docs/04 §11): the back link, the title, the lead, and the main
 * action. On a phone they stack and the action comes after the words, still in the first screen;
 * from 640px the action stands at the end of the title's row, aligned with its last line. No rule
 * and no box: the app takes its hierarchy from type and space (§1).
 */
export function PageHeader({
  title,
  lead,
  action,
  back,
  level = 1,
  titleId,
  className = "",
}: PageHeaderProps) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className={`flex min-w-0 flex-col gap-2 ${className}`.trim()}>
      {back ? <BackLink href={back.href}>{back.label}</BackLink> : null}
      <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <Heading id={titleId} className={PAGE_TITLE_CLASSES}>
            {title}
          </Heading>
          {lead ? (
            <div className="measure mt-3 text-lg leading-relaxed text-ink-2">{lead}</div>
          ) : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-3">{action}</div> : null}
      </div>
    </header>
  );
}
