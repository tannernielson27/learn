import Image from "next/image";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { SiteFooter } from "@/components/site/SiteFooter";
import type { LandingEntry } from "@/lib/auth/landing";

/**
 * A crop of the committed Playwright baseline `e2e/__screenshots__/desktop-1280/case-study.png`
 * (#264): step 1 of the gallery case study, unanswered. It is a picture, so no item, key or
 * rationale is rendered or serialized by this page. Width and height are the file's own.
 */
const SAMPLE = {
  src: "/landing/sample-case-study.png",
  width: 929,
  height: 634,
  alt:
    "A sample case study step. On the left, the patient record for a 74-year-old woman one day " +
    "after hip surgery. On the right, step 1 of 6, Recognize Cues: a highlight question asking " +
    "which findings in the 1400 nurses' note need immediate follow-up.",
} as const;

const PRIMARY = buttonClasses({ variant: "primary", size: "lg" });
const SECONDARY = buttonClasses({ variant: "secondary", size: "lg" });

/** One line each (#416). Every claim is something the product does today. */
const WHAT_IT_DOES = [
  {
    term: "NCLEX question formats",
    detail:
      "Multiple choice, select all that apply, matrix, drop-down, highlight, drag-and-drop, ordered response and bowtie, with six-step case studies.",
  },
  {
    term: "Quizzes",
    detail: "Write questions in the layout students see, and group them into quizzes.",
  },
  {
    term: "Live sessions",
    detail:
      "Students join on their phones with a join code and answer in class. No account needed.",
  },
  {
    term: "Assignments and practice",
    detail: "Assign a quiz with a due time, or share it for practice with instant feedback.",
  },
] as const;

type Row = { term: string; detail: string };

function Rows({ rows }: { rows: readonly Row[] }) {
  return (
    <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
      {rows.map(({ term, detail }) => (
        <div key={term}>
          <dt className="font-semibold text-ink-1">{term}</dt>
          <dd className="mt-1 max-w-prose leading-relaxed text-ink-2">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface LandingProps {
  /** Create an account and Sign in for a visitor, or the signed-in visitor's own home. */
  entry: LandingEntry;
}

/**
 * The public front page (#264). Static apart from `entry`; no item component renders here.
 *
 * Two primary actions, one per reader: the account (or the signed-in visitor's home) with Sign in
 * beside it, and, set apart under a rule, Join a live session for a student in class right now,
 * who needs no account. The order of the links is unchanged.
 */
export function Landing({ entry }: LandingProps) {
  return (
    <>
      <main className="mx-auto w-full max-w-wide flex-1 px-5 pt-10 pb-16 sm:px-6 sm:pt-16 lg:px-8">
        {/*
        The hero (fix/landing-hero): two equal columns from 1024px, 5:7 from 1280px where the copy
        column is wide enough for both actions side by side, centred against each other so neither
        hangs. Gaps are on the spacing scale (24, 32, 48).
      */}
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div>
            <p className="eyebrow">LeaRN</p>
            <h1 className="mt-4 font-read text-display leading-tight text-ink-1">
              Live learning for the Next Generation NCLEX.
            </h1>
            <p className="mt-6 max-w-prose text-lg leading-relaxed text-ink-2">
              Every NCLEX question format, scored like the exam.
            </p>
            {/*
            One two-column grid for both rows, so every action is the same width and height and
            Join a live session sits under the account, with its note where Sign in sits. The rule
            spans the actions and no more.
          */}
            <div className="mt-8 grid max-w-md gap-3 sm:grid-cols-2">
              <Link href={entry.href} className={PRIMARY}>
                {entry.label}
              </Link>
              {entry.also ? (
                <Link href={entry.also.href} className={SECONDARY}>
                  {entry.also.label}
                </Link>
              ) : null}
              <div className="mt-3 border-t border-line pt-6 sm:col-span-2 sm:grid sm:grid-cols-subgrid sm:items-center">
                <Link href="/join" className={`${PRIMARY} w-full`}>
                  Join a live session
                </Link>
                <p className="mt-3 text-ink-2 sm:mt-0">In class now? No account needed.</p>
              </div>
            </div>
          </div>

          <figure className="m-0">
            <p className="eyebrow mb-2">Sample</p>
            <Image
              src={SAMPLE.src}
              width={SAMPLE.width}
              height={SAMPLE.height}
              alt={SAMPLE.alt}
              sizes="(min-width: 1280px) 680px, (min-width: 1024px) 50vw, 100vw"
              // Beside the headline from 1024px up, so it is not left to lazy loading.
              loading="eager"
              className="h-auto w-full rounded-md border border-line"
            />
          </figure>
        </div>

        <section
          aria-labelledby="what-heading"
          className="mt-16 border-t border-line pt-8 sm:mt-20"
        >
          <h2 id="what-heading" className="text-xl font-semibold text-ink-1">
            What LeaRN does
          </h2>
          <Rows rows={WHAT_IT_DOES} />
        </section>
      </main>
      {/* #269: the teacher and question guides are public. #522: one footer for every public page. */}
      <SiteFooter />
    </>
  );
}
