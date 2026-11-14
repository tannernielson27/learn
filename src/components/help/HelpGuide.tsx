import type { ReactNode } from "react";

/**
 * The help guides in the public site's editorial direction (#563, docs/design/landing-563/A.md,
 * "How it carries"): the guide's title in `.display-section`, an "On this page" list, and sections
 * that each open with a near-black rule and a mono number, as the landing page's do.
 *
 * Static markup only: help reads no session and ships no script of its own.
 */

/** One entry in "On this page": a section, and the topics or formats inside it. */
export interface ContentsEntry {
  id: string;
  title: string;
  children?: readonly { id: string; title: string }[];
}

/** A section's number as the landing page sets it: two digits, mono. */
export const sectionNumber = (index: number): string => String(index + 1).padStart(2, "0");

/**
 * Where an anchor lands. Clear of the top edge, so a heading reached from "On this page" or from
 * another screen's link sits a little below it, never under the browser's own bar.
 */
export const ANCHOR_OFFSET = "scroll-mt-8";

// Each a 44px standalone link: the list is a set of targets, not a sentence (WCAG 2.5.8).
const CONTENTS_LINK =
  "tap-target inline-flex items-center py-1 text-sm leading-snug text-ink-1 underline-offset-4 " +
  "decoration-accent hover:text-accent-ink hover:underline";

/**
 * "On this page" (#563). On a phone it is the list at the top of the guide; the formats inside a
 * section wrap as a run of links so the list stays short. From 1024px it stands beside the text,
 * sticky, and scrolls on its own if it is taller than the window.
 */
export function OnThisPage({ entries }: { entries: readonly ContentsEntry[] }) {
  return (
    <nav
      aria-label="On this page"
      className="lg:sticky lg:top-8 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:pr-2"
    >
      <p className="eyebrow">On this page</p>
      <ol className="mt-3 border-t border-rule-strong">
        {entries.map((entry, index) => (
          <li key={entry.id} className="flex items-start gap-3 border-b border-line py-1">
            <span
              aria-hidden="true"
              className="tabular flex min-h-11 w-6 shrink-0 items-center font-mono text-xs text-ink-2"
            >
              {sectionNumber(index)}
            </span>
            <div className="min-w-0 flex-1">
              <a href={`#${entry.id}`} className={`${CONTENTS_LINK} font-semibold`}>
                {entry.title}
              </a>
              {entry.children ? (
                <ul className="-mt-1 flex flex-wrap gap-x-4 pb-2 lg:flex-col lg:gap-x-0 lg:pb-1">
                  {entry.children.map((child) => (
                    <li key={child.id}>
                      <a href={`#${child.id}`} className={`${CONTENTS_LINK} text-ink-2`}>
                        {child.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * A guide's frame: the eyebrow and the title over the whole width, then "On this page" in the
 * narrow column and the sections in the wide one from 1024px. Below that, one column.
 */
export function GuidePage({
  title,
  lead,
  contents,
  children,
}: {
  title: string;
  lead?: ReactNode;
  contents: readonly ContentsEntry[];
  children: ReactNode;
}) {
  return (
    <article className="grid gap-10 lg:grid-cols-12 lg:gap-x-10 lg:gap-y-14">
      <header className="lg:col-span-12">
        <p className="eyebrow">Help</p>
        <h1 className="display-section mt-3">{title}</h1>
        {lead ? (
          <div className="measure mt-4 text-lg leading-relaxed text-ink-2">{lead}</div>
        ) : null}
      </header>
      <div className="lg:col-span-4 xl:col-span-3">
        <OnThisPage entries={contents} />
      </div>
      <div className="flex min-w-0 flex-col gap-16 lg:col-span-8 xl:col-span-8">{children}</div>
    </article>
  );
}

/**
 * One numbered section of a guide: a near-black rule, the mono number, the heading in the serif,
 * then the text at reading width. The `id` is the anchor other pages link to; the heading is
 * `${id}-title`.
 */
export function GuideSection({
  id,
  number,
  title,
  className = "",
  children,
}: {
  id: string;
  number: string;
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={`${ANCHOR_OFFSET} border-t border-rule-strong pt-6`}
    >
      <p aria-hidden="true" className="eyebrow">
        {number}
      </p>
      <h2
        id={`${id}-title`}
        className="mt-3 font-read text-2xl leading-tight text-ink-1 sm:text-3xl"
      >
        {title}
      </h2>
      <div className={`mt-6 ${className}`.trim()}>{children}</div>
    </section>
  );
}

/**
 * A control's name as it appears on screen, such as Start a live session. Set as interface text:
 * the UI face, semibold, in ink on the second surface with a hairline edge and the small radius,
 * so it reads as a label lifted off a screen in both themes. It wraps with its box intact.
 */
export function Ui({ children }: { children: ReactNode }) {
  return (
    <strong className="rounded-sm border border-line bg-surface-2 px-1 py-px font-ui text-[0.9375em] font-semibold text-ink-1 box-decoration-clone">
      {children}
    </strong>
  );
}
