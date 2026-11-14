import type { ReactNode } from "react";
import { CONTENTS_ANCHOR_OFFSET, ContentsNav, sectionNumber } from "@/components/ui/ContentsNav";
import { LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_ISO, OPERATOR_LINE } from "@/lib/site/legal";

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

/**
 * A terms or privacy page (#522), in the site's editorial look (#563, docs/design/landing-563/A.md
 * "How it carries"): the eyebrow, the title in `.display-section`, the date in the mono label
 * style and who runs LeaRN, then the sections. Each opens under a near-black rule with its mono
 * number, and its text keeps the reading width (`measure`, 68ch).
 *
 * The contents (`ContentsNav`, shared with the help guides) list every section. From 1024px they
 * sit sticky in a narrow column beside the header and the text; on a phone they are a plain list
 * above the text.
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
    // One grid from 1024px: the contents in the narrow left column, from the top of the page down,
    // and the header and the sections in the wide one. Below that, header, contents, sections.
    <article className="flex flex-col gap-12 lg:grid lg:grid-cols-12 lg:gap-x-10 lg:gap-y-16">
      <header className="lg:col-span-8 lg:col-start-5 lg:row-start-1">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display-section mt-4">{title}</h1>
        <p className="eyebrow mt-6">
          Last updated <time dateTime={LEGAL_LAST_UPDATED_ISO}>{LEGAL_LAST_UPDATED}</time>
        </p>
        <p className="measure mt-2 text-sm leading-relaxed text-ink-2">{OPERATOR_LINE}</p>
        <div className="measure mt-8 flex flex-col gap-4 text-lg leading-relaxed text-ink-1">
          {intro}
        </div>
      </header>

      <ContentsNav
        label="Contents"
        labelId="legal-contents"
        entries={sections.map(({ id, heading }) => ({ id, title: heading }))}
        className="lg:col-span-3 lg:row-span-2 lg:row-start-1"
      />

      <div className="flex flex-col gap-12 sm:gap-14 lg:col-span-8 lg:col-start-5 lg:row-start-2">
        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-heading`}
            className={`${CONTENTS_ANCHOR_OFFSET} border-t border-rule-strong pt-5`}
          >
            <p aria-hidden="true" className="eyebrow">
              {sectionNumber(index)}
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
    </article>
  );
}

/** A short list inside a section. */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;
}
