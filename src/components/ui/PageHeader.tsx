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

/**
 * The small line above a title that says what the name below it is: "Workspace", "Case study"
 * (docs/04 §11, 2026-11-14). Sentence case in the sans, never the public site's tracked capitals.
 */
export const PAGE_LABEL_CLASSES = "text-sm font-medium text-ink-2";

/**
 * A section's h2 inside an app page (#563): Teachers, Roster, Assignments, Your classes. One
 * style for every page, a step under the title, in the sans so it never competes with it.
 */
export const SECTION_HEADING_CLASSES = "text-lg font-medium text-ink-1";

export type PageHeaderLevel = 1 | 2;

export interface PageHeaderProps {
  /** The page's name: "Library", or a quiz's own name. */
  title: ReactNode;
  /** What the name is, on a line above it: "Case study" over the case study's own title. */
  label?: ReactNode;
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
 * action. The title asks for 20rem; where the action fits beside that it stands at the end of the
 * row, aligned with the title's last line, and where it does not (a phone, a narrow column) it
 * wraps under the words, still in the first screen. The row follows its own width, not the
 * viewport's, so a long title is never squeezed into a column of letters. No rule
 * and no box: the app takes its hierarchy from type and space (§1).
 */
export function PageHeader({
  title,
  label,
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
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div className="min-w-0 flex-[1_1_20rem]">
          {label ? (
            <div
              data-page-label=""
              className={`mb-1 flex flex-wrap items-center gap-2 ${PAGE_LABEL_CLASSES}`}
            >
              {label}
            </div>
          ) : null}
          <Heading id={titleId} className={PAGE_TITLE_CLASSES}>
            {title}
          </Heading>
          {lead ? (
            <div className="measure mt-3 text-lg leading-relaxed text-ink-2">{lead}</div>
          ) : null}
        </div>
        {/* Never wider than the row, so an action of several buttons wraps on a phone (#563). */}
        {action ? <div className="flex max-w-full shrink-0 flex-wrap gap-3">{action}</div> : null}
      </div>
    </header>
  );
}
