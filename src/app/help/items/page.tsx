import type { Metadata } from "next";
import type { ReactNode } from "react";
import { HelpFigure } from "@/components/help/HelpFigure";
import {
  ANCHOR_OFFSET,
  GuidePage,
  GuideSection,
  sectionNumber,
  type ContentsEntry,
} from "@/components/help/HelpGuide";
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

export const metadata: Metadata = { title: "Question guide" };

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
    caption: "Step 1 of a case study, with the patient record beside the question.",
  },
  trend: {
    figure: HELP_FIGURES.trend,
    caption: "The time selector above the patient record makes this a Trend question.",
  },
};

/**
 * The scoring rules, as docs/01-NGN-ITEM-SPEC.md §2 states them. Edit that file first.
 */
const MODELS: { name: string; rule: string }[] = [
  {
    name: "0/1",
    rule: "Each scorable part (an option, a row, a blank, a slot) earns 1 if correct, else 0. The question’s score is the sum.",
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
      <dd className="leading-relaxed text-ink-1">{children}</dd>
    </div>
  );
}

/** The guide's four sections, in order, with the formats and composites under theirs. */
const SECTIONS = [
  { id: "scoring", title: "Scoring models" },
  {
    id: "formats",
    title: "Question formats",
    children: ITEM_TYPES.map((type) => ({
      id: helpSectionId(type),
      title: ITEM_TYPE_LABELS[type],
    })),
  },
  {
    id: "composites",
    title: "Case studies and Trend questions",
    children: COMPOSITE_GUIDE.map((entry) => ({ id: entry.id, title: entry.title })),
  },
  { id: "steps", title: "The six clinical judgment steps" },
] as const satisfies readonly ContentsEntry[];

type SectionId = (typeof SECTIONS)[number]["id"];

const numberOf = (id: SectionId): string =>
  sectionNumber(SECTIONS.findIndex((section) => section.id === id));
const titleOf = (id: SectionId): string => SECTIONS.find((section) => section.id === id)!.title;

/** A format, a composite or a step inside a section: between hairlines, with its own anchor. */
const ENTRY = `${ANCHOR_OFFSET} border-t border-line pt-6`;

function ItemSection({ type }: { type: ItemType }) {
  const entry = ITEM_GUIDE[type];
  const figure = TYPE_FIGURES[type];
  return (
    <section id={helpSectionId(type)} className={ENTRY}>
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
    <GuidePage title="Question guide" contents={SECTIONS}>
      <GuideSection id="scoring" number={numberOf("scoring")} title={titleOf("scoring")}>
        <dl className="measure flex flex-col gap-4">
          {MODELS.map((model) => (
            <Field key={model.name} term={model.name}>
              {model.rule}
            </Field>
          ))}
        </dl>
      </GuideSection>

      <GuideSection
        id="formats"
        number={numberOf("formats")}
        title={titleOf("formats")}
        className="flex flex-col gap-10"
      >
        {ITEM_TYPES.map((type) => (
          <ItemSection key={type} type={type} />
        ))}
      </GuideSection>

      <GuideSection
        id="composites"
        number={numberOf("composites")}
        title={titleOf("composites")}
        className="flex flex-col gap-10"
      >
        {COMPOSITE_GUIDE.map((entry) => {
          const figure = COMPOSITE_FIGURES[entry.id];
          return (
            <section key={entry.id} id={entry.id} className={ENTRY}>
              <h3 className="text-lg font-semibold text-ink-1">{entry.title}</h3>
              <div className="measure mt-2 flex flex-col gap-2 leading-relaxed text-ink-1">
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
      </GuideSection>

      <GuideSection
        id="steps"
        number={numberOf("steps")}
        title={titleOf("steps")}
        className="flex flex-col gap-8"
      >
        <p className="measure leading-relaxed text-ink-1">
          From the NCSBN Clinical Judgment Measurement Model. A case study has one question for each
          step, in this order. Tag any other question with the step it tests.
        </p>
        {STEPS.map((step) => (
          <section key={step} id={`step-${step}`} className={ENTRY}>
            <h3 className="text-lg font-semibold text-ink-1">
              {step}. {CJMM_STEP_LABELS[step]}
            </h3>
            <dl className="measure mt-2 flex flex-col gap-3">
              <Field term="What it asks">{CJMM_GUIDE[step].asks}</Field>
              <Field term="Typical formats">{CJMM_GUIDE[step].formats}</Field>
            </dl>
          </section>
        ))}
      </GuideSection>
    </GuidePage>
  );
}
