import type { ReactNode } from "react";
import {
  CONTENTS_ANCHOR_OFFSET,
  ContentsNav,
  type ContentsEntry,
} from "@/components/ui/ContentsNav";

/**
 * The help guides in the public site's editorial direction (#563, docs/design/landing-563/A.md,
 * "How it carries"): the guide's title in `.display-section`, an "On this page" list, and sections
 * that each open with a near-black rule and a mono number, as the landing page's do.
 *
 * Static markup only: help reads no session and ships no script of its own.
 */

export { sectionNumber, type ContentsEntry } from "@/components/ui/ContentsNav";

/** Where an anchor lands: the shared contents offset, so every guide and legal page agree. */
export const ANCHOR_OFFSET = CONTENTS_ANCHOR_OFFSET;

/** "On this page" (#563): the shared contents list, under the guides' own name for it. */
export function OnThisPage({ entries }: { entries: readonly ContentsEntry[] }) {
  return <ContentsNav label="On this page" labelId="on-this-page" entries={entries} />;
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
