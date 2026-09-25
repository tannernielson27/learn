import Image from "next/image";
import Link from "next/link";
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
    "after hip surgery. On the right, step 1 of 6, Recognize Cues: a highlight item asking which " +
    "findings in the 1400 nurses' note need immediate follow-up.",
} as const;

const PRIMARY =
  "tap-target inline-flex items-center justify-center rounded-sm border border-accent bg-accent px-5 font-medium text-accent-contrast transition-colors duration-fast hover:bg-accent-ink";
const SECONDARY =
  "tap-target inline-flex items-center justify-center rounded-sm border border-line-strong bg-surface-1 px-5 font-medium text-ink-1 transition-colors duration-fast hover:bg-surface-2";

const WHAT_IT_DOES = [
  {
    term: "Exam-faithful items",
    detail:
      "Every Next Generation NCLEX format, from matrix and drop-down cloze to bowtie and trend, laid out and scored the way the exam does it, with six-step case studies beside a patient record.",
  },
  {
    term: "Fast authoring",
    detail:
      "Write an item in the same layout students will see, check it as you go, and keep it in banks with folders, tags and version history.",
  },
  {
    term: "Live sessions",
    detail:
      "Run a class from the front of the room. Students join from their phones with a code, answer, and see the rationale when you reveal it.",
  },
  {
    term: "Take-home work",
    detail:
      "Set assignments with a due time for a class, and share banks for practice with instant feedback.",
  },
] as const;

export interface LandingProps {
  /** Sign in for a visitor, or the signed-in visitor's own home. */
  entry: LandingEntry;
}

/** The public front page (#264). Static apart from `entry`; no item component renders here. */
export function Landing({ entry }: LandingProps) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-10 pb-16 sm:px-6 sm:pt-16 lg:px-8">
      <p className="eyebrow">LeaRN</p>

      <div className="mt-4 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-12">
        <div>
          <h1 className="font-read text-4xl leading-tight text-ink-1 sm:text-5xl">
            Live learning for the Next Generation NCLEX.
          </h1>
          <p className="mt-5 max-w-prose text-lg leading-relaxed text-ink-2">
            Clinical judgment practice that looks and scores like the exam, run live in class or
            taken home. Built for phones in the lecture hall and laptops at home.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link href={entry.href} className={PRIMARY}>
              {entry.label}
            </Link>
            <Link href="/join" className={SECONDARY}>
              Join a live session
            </Link>
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
            Step 1 of a six-step case study, with the chart beside the question. The patient is
            fictional.
          </figcaption>
        </figure>
      </div>

      <section aria-labelledby="what-heading" className="mt-16 border-t border-line pt-8 sm:mt-20">
        <h2 id="what-heading" className="text-xl font-semibold text-ink-1">
          What LeaRN does
        </h2>
        <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {WHAT_IT_DOES.map(({ term, detail }) => (
            <div key={term}>
              <dt className="font-medium text-ink-1">{term}</dt>
              <dd className="mt-1 max-w-prose leading-relaxed text-ink-2">{detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-12 grid gap-12 border-t border-line pt-8 sm:grid-cols-2 sm:gap-10">
        <section aria-labelledby="who-heading">
          <h2 id="who-heading" className="text-xl font-semibold text-ink-1">
            Who it is for
          </h2>
          <p className="mt-3 max-w-prose leading-relaxed text-ink-2">
            Nursing instructors who teach toward the NCLEX, and their students. Instructors write
            and run the items; students answer them in class and practice between classes.
          </p>
        </section>

        <section aria-labelledby="access-heading">
          <h2 id="access-heading" className="text-xl font-semibold text-ink-1">
            How to get in
          </h2>
          <p className="mt-3 max-w-prose leading-relaxed text-ink-2">
            LeaRN is invite-only. Instructor accounts are set up by the site&apos;s owner; once
            yours exists, sign in with a link sent to your email. Students arrive through a class
            invite from their instructor, or join a live session with the code shown in class.
          </p>
        </section>
      </div>

      <div className="mt-16 flex flex-col gap-2 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between">
        <p>Every patient and chart shown in LeaRN is fictional.</p>
        {/* #269: the instructor and item guides are public. */}
        <nav aria-label="Footer">
          <Link
            href="/help"
            className="tap-target inline-flex items-center text-accent-ink underline underline-offset-4"
          >
            Help
          </Link>
        </nav>
      </div>
    </main>
  );
}
