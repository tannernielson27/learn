import type { Metadata } from "next";
import type { ReactNode } from "react";
import { HelpFigure } from "@/components/help/HelpFigure";
import {
  CJMM_GUIDE,
  COMPOSITE_GUIDE,
  HELP_FIGURES,
  ITEM_GUIDE,
  helpSectionId,
  type HelpFigure as Figure,
} from "@/lib/help/itemGuide";
import { ITEM_TYPES, ITEM_TYPE_LABELS, type ItemType } from "@/lib/ngn/labels";
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";

export const metadata: Metadata = { title: "Item guide" };

const STEPS = Object.keys(CJMM_STEP_LABELS).map(Number) as CjmmStep[];

/** Screenshots shown under a section, with their captions. Answer mode only (decision 6). */
const TYPE_FIGURES: Partial<Record<ItemType, { figure: Figure; caption: string }>> = {
  dropdown_rationale: {
    figure: HELP_FIGURES.dropdownRationale,
    caption: "A triad: the condition is the anchor, and the two findings support it.",
  },
  bowtie: {
    figure: HELP_FIGURES.bowtie,
    caption: "Five slots: two actions, one condition, two parameters.",
  },
};

const COMPOSITE_FIGURES: Record<string, { figure: Figure; caption: string }> = {
  "case-study": {
    figure: HELP_FIGURES.caseStudy,
    caption: "Step 1 of a case study, with the patient record beside the item.",
  },
  trend: {
    figure: HELP_FIGURES.trend,
    caption: "The time selector above the record is what makes this a Trend item.",
  },
};

/**
 * The scoring rules, as docs/01-NGN-ITEM-SPEC.md §2 states them. Edit that file first.
 */
const MODELS: { name: string; rule: string }[] = [
  {
    name: "0/1",
    rule: "Each scorable part (an option, a row, a blank, a slot) earns 1 if correct, else 0. The item’s score is the sum.",
  },
  {
    name: "+/-",
    rule: "+1 for each correct selection, -1 for each incorrect selection, and the score never goes below 0. The most it can earn is the number of correct options. Grouped and table formats apply this to each row, then add the rows.",
  },
  {
    name: "Rationale, dyad",
    rule: "One sentence, two blanks: 1 point only if both are correct.",
  },
  {
    name: "Rationale, triad",
    rule: "One sentence, three blanks sharing an anchor, usually the condition. 2 points max: the anchor must be correct, and each of the two supporting blanks then earns 1. Anchor wrong: 0.",
  },
];

function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm font-semibold text-ink-2">{term}</dt>
      <dd className="text-ink-1">{children}</dd>
    </div>
  );
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="border-b border-line pb-2 text-xl font-semibold text-ink-1">
      {children}
    </h2>
  );
}

function Contents() {
  const link = "text-accent-ink underline-offset-4 hover:underline";
  return (
    <nav aria-label="On this page" className="rounded-md border border-line bg-surface-1 p-4">
      <p className="eyebrow">On this page</p>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <li>
          <a href="#scoring" className={link}>
            Scoring models
          </a>
        </li>
        {ITEM_TYPES.map((type) => (
          <li key={type}>
            <a href={`#${helpSectionId(type)}`} className={link}>
              {ITEM_TYPE_LABELS[type]}
            </a>
          </li>
        ))}
        {COMPOSITE_GUIDE.map((entry) => (
          <li key={entry.id}>
            <a href={`#${entry.id}`} className={link}>
              {entry.title}
            </a>
          </li>
        ))}
        <li>
          <a href="#steps" className={link}>
            The six clinical judgment steps
          </a>
        </li>
      </ul>
    </nav>
  );
}

function ItemSection({ type }: { type: ItemType }) {
  const entry = ITEM_GUIDE[type];
  const figure = TYPE_FIGURES[type];
  return (
    <section id={helpSectionId(type)} className="scroll-mt-4">
      <h3 className="text-lg font-semibold text-ink-1">{ITEM_TYPE_LABELS[type]}</h3>
      <dl className="measure mt-2 flex flex-col gap-3">
        <Field term="What it tests">{entry.tests}</Field>
        <Field term="How it is scored">{entry.scoring}</Field>
        <Field term="Tip">{entry.tip}</Field>
      </dl>
      {figure ? <HelpFigure figure={figure.figure} caption={figure.caption} /> : null}
    </section>
  );
}

export default function ItemGuide() {
  return (
    <article className="flex flex-col gap-10">
      <header>
        <p className="eyebrow">Help</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-1 sm:text-3xl">
          Item guide
        </h1>
        <p className="measure mt-3 text-lg text-ink-2">
          Every item format LeaRN supports: what it tests, how it is scored, and one tip for writing
          it well. Scores are whole numbers from 0 to the item’s maximum.
        </p>
      </header>

      <Contents />

      <section aria-labelledby="scoring" className="flex flex-col gap-4">
        <SectionHeading id="scoring">Scoring models</SectionHeading>
        <dl className="measure flex flex-col gap-3">
          {MODELS.map((model) => (
            <Field key={model.name} term={model.name}>
              {model.rule}
            </Field>
          ))}
        </dl>
      </section>

      <section aria-labelledby="formats" className="flex flex-col gap-8">
        <SectionHeading id="formats">Item formats</SectionHeading>
        {ITEM_TYPES.map((type) => (
          <ItemSection key={type} type={type} />
        ))}
      </section>

      <section aria-labelledby="composites" className="flex flex-col gap-8">
        <SectionHeading id="composites">Case studies and Trend items</SectionHeading>
        {COMPOSITE_GUIDE.map((entry) => {
          const figure = COMPOSITE_FIGURES[entry.id];
          return (
            <section key={entry.id} id={entry.id} className="scroll-mt-4">
              <h3 className="text-lg font-semibold text-ink-1">{entry.title}</h3>
              <div className="measure mt-2 flex flex-col gap-2 text-ink-1">
                {entry.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                <p>
                  <span className="font-semibold">How it is scored:</span> {entry.scoring}
                </p>
              </div>
              {figure ? <HelpFigure figure={figure.figure} caption={figure.caption} /> : null}
            </section>
          );
        })}
      </section>

      <section aria-labelledby="steps" className="flex flex-col gap-6">
        <SectionHeading id="steps">The six clinical judgment steps</SectionHeading>
        <p className="measure text-ink-1">
          The NCSBN Clinical Judgment Measurement Model. A case study has one item for each step, in
          this order. Tag a standalone item with the step it exercises.
        </p>
        {STEPS.map((step) => (
          <section key={step} id={`step-${step}`} className="scroll-mt-4">
            <h3 className="text-lg font-semibold text-ink-1">
              {step}. {CJMM_STEP_LABELS[step]}
            </h3>
            <dl className="measure mt-2 flex flex-col gap-3">
              <Field term="What it asks">{CJMM_GUIDE[step].asks}</Field>
              <Field term="Typical formats">{CJMM_GUIDE[step].formats}</Field>
            </dl>
          </section>
        ))}
      </section>
    </article>
  );
}
