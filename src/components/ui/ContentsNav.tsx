/**
 * The contents list the long reading pages share (#563): the terms and privacy pages ("Contents")
 * and the help guides ("On this page"). One look, one numbering and one scroll offset, in place of
 * the two each page had built for itself.
 *
 * Static markup only, so a page that ships no script of its own can use it.
 */

/** A section's number as the landing page sets it: two digits, mono. "01", "02". */
export const sectionNumber = (index: number): string => String(index + 1).padStart(2, "0");

/**
 * Where an anchor lands, on every section the contents link to: clear of the top edge, so a
 * heading reached from the list or from another screen's link sits a little below it.
 */
export const CONTENTS_ANCHOR_OFFSET = "scroll-mt-8";

/** One entry: a section, and the topics or formats inside it. */
export interface ContentsEntry {
  id: string;
  title: string;
  children?: readonly { id: string; title: string }[];
}

// Each a 44px row: the list is a set of targets, not a sentence (WCAG 2.5.8). Ink, not blue, so a
// list of eighteen links reads as an index; hover underlines it and focus draws the global ring.
const LINK =
  "tap-target rounded-sm text-sm leading-snug underline-offset-4 hover:text-accent-ink hover:underline";

export interface ContentsNavProps {
  /** What the list is called, shown and used as its name: "Contents", "On this page". */
  label: string;
  /** The label's id, which names the navigation landmark. Unique on the page. */
  labelId: string;
  entries: readonly ContentsEntry[];
  className?: string;
}

/**
 * On a phone, a plain list above the text; the topics inside a section wrap as a run of links so
 * it stays short. From 1024px the page puts it in a narrow column beside the text, where it stands
 * sticky (`top-8`, the same offset its anchors land at) and scrolls on its own if the window is
 * shorter than it. It opens under the near-black rule the sections open with. The label is a
 * paragraph, not a heading, so the page's h2s are its sections and nothing else.
 */
export function ContentsNav({ label, labelId, entries, className = "" }: ContentsNavProps) {
  return (
    <nav
      aria-labelledby={labelId}
      className={`border-t border-rule-strong pt-4 lg:sticky lg:top-8 lg:max-h-[calc(100dvh-4rem)] lg:self-start lg:overflow-y-auto lg:pr-2 ${className}`.trim()}
    >
      <p id={labelId} className="eyebrow">
        {label}
      </p>
      <ol className="mt-2 divide-y divide-line">
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              className={`${LINK} flex items-baseline gap-3 py-2.5 text-ink-1 ${entry.children ? "font-semibold" : ""}`.trim()}
            >
              {/* Drawn for the eye; a screen reader hears each heading once. */}
              <span
                aria-hidden="true"
                className="tabular w-6 shrink-0 font-mono text-xs font-normal text-ink-2"
              >
                {sectionNumber(index)}
              </span>
              <span>{entry.title}</span>
            </a>
            {entry.children ? (
              <ul className="-mt-1 flex flex-wrap gap-x-4 pb-2 pl-9 lg:flex-col lg:gap-x-0 lg:pb-1">
                {entry.children.map((child) => (
                  <li key={child.id}>
                    <a
                      href={`#${child.id}`}
                      className={`${LINK} inline-flex items-center py-1 text-ink-2`}
                    >
                      {child.title}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}
