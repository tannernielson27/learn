import type { ReactNode } from "react";
import { LEGAL_LAST_UPDATED, LEGAL_LAST_UPDATED_ISO, OPERATOR_LINE } from "@/lib/site/legal";

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

/**
 * A terms or privacy page (#522): the help pages' eyebrow and serif heading, the date and who runs
 * LeaRN, then short sections, each under its own h2, at reading width.
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
    <article className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-2 font-read text-display leading-tight text-ink-1">{title}</h1>
        <p className="mt-4 text-sm text-ink-2">
          Last updated <time dateTime={LEGAL_LAST_UPDATED_ISO}>{LEGAL_LAST_UPDATED}</time>
        </p>
        <p className="measure mt-1 text-sm text-ink-2">{OPERATOR_LINE}</p>
        <div className="measure mt-6 flex flex-col gap-3 leading-relaxed text-ink-1">{intro}</div>
      </header>
      {sections.map((section) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-heading`}
          className="scroll-mt-4"
        >
          <h2 id={`${section.id}-heading`} className="text-xl font-semibold text-ink-1">
            {section.heading}
          </h2>
          <div className="measure mt-3 flex flex-col gap-3 leading-relaxed text-ink-1">
            {section.body}
          </div>
        </section>
      ))}
    </article>
  );
}

/** A short list inside a section. */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;
}
