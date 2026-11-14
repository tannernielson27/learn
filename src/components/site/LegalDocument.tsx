import type { ReactNode } from "react";
import { LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_ISO, OPERATOR_LINE } from "@/lib/site/legal";

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

/** "01", "02": a section's mono number, as the landing page numbers its sections. */
export function legalSectionNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

// A contents entry: the number in mono, the heading beside it, a 44px row. Ink, not blue, so a
// list of eighteen links reads as an index; hover underlines it and focus draws the global ring.
const CONTENTS_LINK =
  "tap-target flex items-baseline gap-3 rounded-sm py-2.5 text-sm leading-snug text-ink-1 " +
  "underline-offset-4 hover:text-accent-ink hover:underline";

/**
 * A terms or privacy page (#522), in the site's editorial look (#563, docs/design/landing-563/A.md
 * "How it carries"): the eyebrow, the title in `.display-section`, the date in the mono label
 * style and who runs LeaRN, then the sections. Each opens under a near-black rule with its mono
 * number, and its text keeps the reading width (`measure`, 68ch).
 *
 * The contents list every section. From 1024px it sits sticky in a narrow column beside the text,
 * scrolling on its own if the window is short; on a phone it is a plain list above the text. The
 * contents' label is a paragraph, not a heading, so the page's h2s are the sections and nothing
 * else.
 */
export function LegalDocument({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  sections: readonly LegalSection[];
}) {
  return (
    <article className="flex flex-col gap-12 lg:gap-16">
      <header className="lg:grid lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-8 lg:col-start-5">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="display-section mt-4">{title}</h1>
          <p className="eyebrow mt-6">
            Last updated <time dateTime={LEGAL_LAST_UPDATED_ISO}>{LEGAL_LAST_UPDATED}</time>
          </p>
          <p className="measure mt-2 text-sm leading-relaxed text-ink-2">{OPERATOR_LINE}</p>
          <div className="measure mt-8 flex flex-col gap-4 text-lg leading-relaxed text-ink-1">
            {intro}
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-12 lg:grid lg:grid-cols-12 lg:gap-10">
        <nav
          aria-labelledby="legal-contents"
          className="border-t border-rule-strong pt-4 lg:sticky lg:top-6 lg:col-span-3 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto"
        >
          <p id="legal-contents" className="eyebrow">
            Contents
          </p>
          <ol className="mt-2 divide-y divide-line">
            {sections.map((section, index) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className={CONTENTS_LINK}>
                  <span aria-hidden="true" className="w-6 shrink-0 font-mono text-xs text-ink-2">
                    {legalSectionNumber(index)}
                  </span>
                  <span>{section.heading}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex flex-col gap-12 sm:gap-14 lg:col-span-8 lg:col-start-5">
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-heading`}
              className="scroll-mt-6 border-t border-rule-strong pt-5"
            >
              <p aria-hidden="true" className="eyebrow">
                {legalSectionNumber(index)}
              </p>
              <h2
                id={`${section.id}-heading`}
                className="mt-3 font-read text-2xl leading-tight text-ink-1"
              >
                {section.heading}
              </h2>
              <div className="measure mt-4 flex flex-col gap-4 leading-relaxed text-ink-1">
                {section.body}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

/** A short list inside a section. */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;
}
