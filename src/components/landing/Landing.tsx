import Link from "next/link";
import { Marker } from "@/components/site/Marker";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { buttonClasses } from "@/components/ui/Button";
import { textLinkClasses } from "@/components/ui/TextLink";
import type { LandingEntry } from "@/lib/auth/landing";
import { PRICING_PATH } from "@/lib/site/links";
import { OFFER, trialEntry } from "@/lib/site/offer";
import { JoinDoor } from "./JoinDoor";
import { ALSO, CASE_STEPS, FORMATS, HOW_IT_WORKS } from "./landingCopy";
import { LiveClassSpecimen } from "./LiveClassSpecimen";

const PRIMARY = buttonClasses({ variant: "primary", size: "lg" });
const SECONDARY = buttonClasses({ variant: "secondary", size: "lg" });
/** On a phone the hero's two actions share a row, still 56px tall, so the join code fits above the fold. */
const SNUG = "max-sm:px-4 max-sm:text-base";
const SECTION = "mx-auto w-full max-w-wide px-5 sm:px-6 lg:px-8";
const H2 = "mt-3 font-read text-title leading-tight text-ink-1 sm:text-display";

export interface LandingProps {
  /** Create an account and Sign in for a visitor, or the signed-in visitor's own home. */
  entry: LandingEntry;
}

/** The main action and Sign in beside it, or a signed-in visitor's own home alone. */
function Actions({ entry }: { entry: LandingEntry }) {
  return (
    <div className="flex gap-3">
      <Link href={entry.href} className={`${PRIMARY} ${SNUG} max-sm:flex-1`}>
        {entry.label}
      </Link>
      {entry.also ? (
        <Link href={entry.also.href} className={`${SECONDARY} ${SNUG}`}>
          {entry.also.label}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The public front page (#264, redrawn for #563 in the patient record direction:
 * docs/design/landing-563/C.md). Static apart from `entry`; no question component renders here,
 * and the specimen is drawn from fixture words alone.
 *
 * Two doors, one per reader: a teacher's free trial (or a signed-in visitor's own home) with Sign
 * in beside it, and a student's join code, both above the fold on a 375px phone. Then the live
 * session, annotated; how it works; every format; and the price, each under a time stamp.
 */
export function Landing({ entry: given }: LandingProps) {
  const entry = trialEntry(given);
  return (
    <>
      <div className="flex flex-1 flex-col">
        <SiteHeader signIn={entry.also !== undefined} />
        <main className="flex-1">
          <section
            aria-labelledby="hero-heading"
            className={`${SECTION} grid gap-6 pt-6 pb-12 sm:pt-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:gap-12 lg:pt-20 lg:pb-16`}
          >
            <div>
              <p className="eyebrow text-brand">{OFFER.audience}</p>
              <h1
                id="hero-heading"
                className="mt-3 font-read text-hero leading-[1.08] tracking-tight text-ink-1"
              >
                Next Generation NCLEX quizzes, live in your classroom.
              </h1>
              <p className="mt-3 max-w-prose text-lg leading-relaxed text-ink-2 sm:mt-5 sm:text-xl">
                Students answer on their phones, in the exam&rsquo;s own layout, and every question
                is scored like the exam.
              </p>
              <div className="mt-5 sm:mt-8">
                <Actions entry={entry} />
              </div>
              <p className="mt-4 hidden font-mono text-xs tracking-[0.04em] text-ink-2 tabular sm:block">
                {OFFER.trial} · {OFFER.price} {OFFER.per} · {OFFER.students.toLowerCase()}
              </p>
            </div>
            <JoinDoor />
          </section>

          <section aria-labelledby="specimen-heading" className={`${SECTION} pb-16 sm:pb-24`}>
            <Marker time="0900">In class</Marker>
            <h2 id="specimen-heading" className={H2}>
              One question on the screen, an answer from every phone.
            </h2>
            <p className="measure mt-3 leading-relaxed text-ink-2">
              The projector view shows the question, the join code and how many have answered. Each
              student answers on their own phone, in the NCLEX layout they will see on the exam.
            </p>
            <div className="mt-8">
              <LiveClassSpecimen />
            </div>
          </section>

          <section aria-labelledby="how-heading" className={`${SECTION} pb-16 sm:pb-24`}>
            <Marker time="1000">How it works</Marker>
            <h2 id="how-heading" className={H2}>
              From a quiz to a reviewed answer, in one class.
            </h2>
            <ol className="mt-8 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-2 xl:grid-cols-4">
              {HOW_IT_WORKS.map((step, index) => (
                <li key={step.title} className="bg-surface-1 p-5">
                  <p className="font-mono text-xs font-semibold text-brand tabular">
                    Step {index + 1} of {HOW_IT_WORKS.length}
                  </p>
                  <h3 className="mt-2 text-lg font-semibold text-ink-1">{step.title}</h3>
                  <p className="mt-1 leading-relaxed text-ink-2">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="formats-heading" className={`${SECTION} pb-16 sm:pb-24`}>
            <Marker time="1100">Question formats</Marker>
            <h2 id="formats-heading" className={H2}>
              Every Next Generation NCLEX format, and six-step case studies.
            </h2>
            <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">Question formats and what a student does</caption>
                <thead>
                  <tr className="border-b border-line-strong font-mono text-xs tracking-[0.08em] text-ink-2 uppercase">
                    <th scope="col" className="w-10 py-2 pr-3 font-semibold">
                      <span className="sr-only">Number</span>
                    </th>
                    <th scope="col" className="py-2 pr-4 font-semibold">
                      Format
                    </th>
                    <th scope="col" className="py-2 font-semibold">
                      The student
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FORMATS.map((format, index) => (
                    <tr key={format.name} className="border-b border-line align-baseline">
                      <td className="py-3 pr-3 font-mono text-xs text-ink-2 tabular">
                        {String(index + 1).padStart(2, "0")}
                      </td>
                      <th scope="row" className="py-3 pr-4 font-semibold text-ink-1">
                        {format.name}
                      </th>
                      <td className="py-3 text-ink-2">{format.does}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-col gap-8">
                <div className="rounded-md border border-line bg-surface-1 p-5">
                  <h3 className="text-lg font-semibold text-ink-1">Case studies</h3>
                  <p className="mt-1 leading-relaxed text-ink-2">
                    One fictional patient record, six questions, one for each clinical judgment
                    step.
                  </p>
                  <ol className="mt-4 flex flex-col border-l-2 border-brand">
                    {CASE_STEPS.map((step, index) => (
                      <li key={step} className="flex items-baseline gap-3 py-1 pl-4">
                        <span className="font-mono text-xs font-semibold text-brand tabular">
                          {index + 1}
                        </span>
                        <span className="text-ink-1">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <dl className="flex flex-col divide-y divide-line border-y border-line">
                  {ALSO.map((row) => (
                    <div key={row.term} className="py-4">
                      <dt className="font-semibold text-ink-1">{row.term}</dt>
                      <dd className="mt-1 leading-relaxed text-ink-2">{row.detail}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </section>

          <section aria-labelledby="price-heading" className={`${SECTION} pb-16 sm:pb-24`}>
            <Marker time="1200">Pricing</Marker>
            <div className="mt-3 grid gap-8 lg:grid-cols-2 lg:items-start">
              <div>
                <h2
                  id="price-heading"
                  className="font-read text-title leading-tight text-ink-1 sm:text-display"
                >
                  One price for the whole workspace.
                </h2>
                <p className="measure mt-3 leading-relaxed text-ink-2">
                  {OFFER.audience}, and their students. Paid for by the workspace, never by
                  students.
                </p>
              </div>
              <div className="rounded-md border border-line bg-surface-1">
                <p className="flex flex-wrap items-baseline gap-x-3 border-b border-line px-5 py-4">
                  <span className="font-read text-display leading-none text-ink-1 tabular">
                    {OFFER.price}
                  </span>
                  <span className="text-ink-2">{OFFER.per}</span>
                </p>
                <ul className="flex flex-col divide-y divide-line px-5">
                  {[OFFER.teachers, OFFER.trial, OFFER.students].map((line) => (
                    <li key={line} className="py-3 text-ink-1">
                      {line}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-col gap-3 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <Link href={entry.href} className={PRIMARY}>
                    {entry.label}
                  </Link>
                  <Link href={PRICING_PATH} className={textLinkClasses()}>
                    See pricing
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
      {/* #269: the teacher and question guides are public. #522: one footer for every public page. */}
      <SiteFooter />
    </>
  );
}
