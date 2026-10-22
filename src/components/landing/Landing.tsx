import Image from "next/image";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextLink";
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

const HOW_TO_GET_IN = [
  { term: "Teachers", detail: "Create an account. You get a workspace of your own." },
  {
    term: "Students",
    detail: "Create an account, then join your class with its invite link or class code.",
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
    <main className="mx-auto w-full max-w-wide flex-1 px-5 pt-10 pb-16 sm:px-6 sm:pt-16 lg:px-8">
      <p className="eyebrow">LeaRN</p>

      <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12">
        <div>
          <h1 className="font-read text-display leading-tight text-ink-1">
            Live learning for the Next Generation NCLEX.
          </h1>
          <p className="mt-5 max-w-prose text-lg leading-relaxed text-ink-2">
            Quizzes in every NCLEX question format, scored like the exam. For nursing teachers and
            their students.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href={entry.href} className={PRIMARY}>
              {entry.label}
            </Link>
            {entry.also ? (
              <Link href={entry.also.href} className={SECONDARY}>
                {entry.also.label}
              </Link>
            ) : null}
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:gap-5">
            <Link href="/join" className={PRIMARY}>
              Join a live session
            </Link>
            <p className="text-ink-2">In class now? No account needed.</p>
          </div>
        </div>

        <figure className="m-0">
          <p className="eyebrow mb-2">Sample</p>
          <Image
            src={SAMPLE.src}
            width={SAMPLE.width}
            height={SAMPLE.height}
            alt={SAMPLE.alt}
            sizes="(min-width: 1024px) 640px, 100vw"
            // Beside the headline from 1024px up, so it is not left to lazy loading.
            loading="eager"
            className="h-auto w-full rounded-md border border-line"
          />
          <figcaption className="mt-3 text-sm text-ink-2">
            Step 1 of a case study, with the patient record beside the question.
          </figcaption>
        </figure>
      </div>

      <section aria-labelledby="what-heading" className="mt-16 border-t border-line pt-8 sm:mt-20">
        <h2 id="what-heading" className="text-xl font-semibold text-ink-1">
          What LeaRN does
        </h2>
        <Rows rows={WHAT_IT_DOES} />
      </section>

      <section aria-labelledby="access-heading" className="mt-12 border-t border-line pt-8">
        <h2 id="access-heading" className="text-xl font-semibold text-ink-1">
          How to get in
        </h2>
        <Rows rows={HOW_TO_GET_IN} />
      </section>

      <div className="mt-16 flex flex-col gap-2 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between">
        <p>Every patient shown in LeaRN is fictional.</p>
        {/* #269: the teacher and question guides are public. */}
        <nav aria-label="Footer">
          <TextLink href="/help" size="sm">
            Help
          </TextLink>
        </nav>
      </div>
    </main>
  );
}
