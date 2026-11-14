import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { buttonClasses } from "@/components/ui/Button";
import { TextLink } from "@/components/ui/TextLink";
import type { LandingEntry } from "@/lib/auth/landing";
import { PRICING_PATH } from "@/lib/site/links";
import { OFFER_FACTS, OFFER_PERIOD, OFFER_PRICE, OFFER_SUMMARY } from "@/lib/site/offer";
import { JoinCodeForm } from "./JoinCodeForm";
import { LiveClass } from "./LiveClass";

// On a phone the two hero actions share one row, so they step down to the body size there.
const PRIMARY = `${buttonClasses({ variant: "primary", size: "lg" })} max-sm:px-4 max-sm:text-base`;
const SECONDARY = `${buttonClasses({ variant: "secondary", size: "lg" })} max-sm:px-4 max-sm:text-base`;

/** A teacher's live session, in the glossary's words (#563). */
const STEPS = [
  {
    title: "Write or import a quiz",
    detail: "Write questions in the layout students see on the exam, and group them into a quiz.",
  },
  {
    title: "Start a live session",
    detail: "The question goes on the projector, with a join code and a QR code beside it.",
  },
  {
    title: "Students join with a code",
    detail: "They type the join code on their phones and answer. No account needed.",
  },
  {
    title: "Reveal and review",
    detail: "Show the answer and its rationale when the count is in, then talk it through.",
  },
] as const;

/** Every format LeaRN draws today (docs/01-NGN-ITEM-SPEC.md), in the words a teacher knows. */
const FORMATS = [
  "Multiple choice",
  "Select all that apply",
  "Matrix",
  "Drop-down",
  "Highlight",
  "Drag-and-drop",
  "Ordered response",
  "Bowtie",
] as const;

/** Each line is something the product does today. */
const BEYOND = [
  {
    title: "Assignments",
    detail: "Assign a quiz or a case study to a class, with open and due dates.",
  },
  {
    title: "Practice",
    detail: "Share a quiz for practice. Students see each answer and its rationale at once.",
  },
  {
    title: "Reports",
    detail: "Read a report of every live session and assignment.",
  },
] as const;

export interface LandingProps {
  /** Start your free trial and Sign in for a visitor, or the signed-in visitor's own home. */
  entry: LandingEntry;
}

/**
 * The public front page (#264, redesigned for #563 in the "editorial" direction): warm paper,
 * near-black ink, the serif at display size, and clinical blue only on what can be pressed.
 *
 * Two readers. A teacher reads the headline, the live session beside it and the price, with
 * Start your free trial (or their own home, signed in) and Sign in. A student in class gets the
 * join code form in the first screen of a phone, with no account. Below, four numbered sections:
 * how a live session works, every format, assignments and practice, and the price.
 *
 * Static apart from `entry`. The drawing of a live session carries the question's words and
 * nothing of its key (`liveClassDemo.ts`).
 */
export function Landing({ entry }: LandingProps) {
  return (
    <>
      <SiteHeader signIn={entry.also !== undefined} />
      <main className="flex-1">
        <section
          aria-labelledby="landing-heading"
          className="mx-auto grid w-full max-w-site gap-12 px-4 pt-6 pb-16 sm:px-6 sm:pt-12 lg:grid-cols-12 lg:gap-10 lg:px-10 lg:pt-16 lg:pb-24"
        >
          <div className="lg:col-span-6 xl:col-span-5">
            <p className="eyebrow">For nursing faculty · Next Generation NCLEX</p>
            <h1 id="landing-heading" className="display-hero mt-3 sm:mt-5">
              Next Generation NCLEX quizzes, live in class.
            </h1>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-ink-2 sm:mt-6">
              Students answer on their phones, and every question is scored like the exam.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 sm:mt-8">
              <Link href={entry.href} className={PRIMARY}>
                {entry.label}
              </Link>
              {entry.also ? (
                <Link href={entry.also.href} className={SECONDARY}>
                  {entry.also.label}
                </Link>
              ) : null}
            </div>
            <p className="mt-3 max-w-md text-sm text-ink-2">{OFFER_SUMMARY}</p>
            {/* The student's door: in the first screen of a phone, set apart under a rule. */}
            <div className="mt-6 max-w-md border-t border-rule-strong pt-4 sm:mt-10 sm:pt-5">
              <JoinCodeForm />
            </div>
          </div>
          <div className="lg:col-span-6 lg:pt-2 xl:col-span-6 xl:col-start-7">
            <LiveClass />
          </div>
        </section>

        <Section number="01" id="how" title="How a live session works">
          <ol className="grid gap-x-8 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((item, index) => (
              <li key={item.title} className="border-t border-line pt-4">
                <p aria-hidden="true" className="font-read text-3xl leading-none text-ink-2">
                  {index + 1}
                </p>
                <h3 className="mt-3 font-semibold text-ink-1">{item.title}</h3>
                <p className="mt-1 leading-relaxed text-ink-2">{item.detail}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          number="02"
          id="formats"
          title="Every Next Generation NCLEX format"
          lead="Each question keeps the exam's layout on every phone and is scored by the exam's rules, partial credit included."
        >
          <ul className="grid grid-cols-2 border-t border-line sm:grid-cols-4">
            {FORMATS.map((format) => (
              <li
                key={format}
                className="flex min-h-16 items-center border-b border-line py-3 pr-3 font-read text-lg leading-snug text-ink-1"
              >
                {format}
              </li>
            ))}
          </ul>
          <div className="mt-8 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-8">
            <h3 className="font-read text-2xl leading-tight text-ink-1">Six-step case studies</h3>
            <p className="max-w-prose leading-relaxed text-ink-2">
              One patient record with its tabs beside six questions, one for each clinical judgment
              step, as the exam sets them out. Start one as a live session, or assign it to a class.
            </p>
          </div>
        </Section>

        <Section number="03" id="beyond" title="Assignments and practice">
          <dl className="grid gap-x-8 gap-y-6 sm:grid-cols-3">
            {BEYOND.map((item) => (
              <div key={item.title} className="border-t border-line pt-4">
                <dt className="font-semibold text-ink-1">{item.title}</dt>
                <dd className="mt-1 leading-relaxed text-ink-2">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          number="04"
          id="price"
          title="Pricing"
          lead="For nursing faculty teaching for the Next Generation NCLEX. One subscription covers the whole workspace, and students never pay."
          band
        >
          <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
            <p className="display-hero">
              {OFFER_PRICE}
              <span className="block pt-3 font-ui text-lg tracking-normal text-ink-2">
                {OFFER_PERIOD}
              </span>
            </p>
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {OFFER_FACTS.map((fact) => (
                <li key={fact} className="py-3 text-ink-1">
                  {fact}
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href={entry.href} className={PRIMARY}>
              {entry.label}
            </Link>
            <TextLink href={PRICING_PATH}>See pricing</TextLink>
          </div>
        </Section>
      </main>
      {/* #269: the teacher and question guides are public. #522: one footer for every public page. */}
      <SiteFooter />
    </>
  );
}

/**
 * One numbered section (#563): a near-black rule, the number and the heading in the narrow left
 * column from 1024px, and the content in the wide one. `band` sets it on the deeper paper.
 */
function Section({
  number,
  id,
  title,
  lead,
  band = false,
  children,
}: {
  number: string;
  id: string;
  title: string;
  lead?: string;
  band?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={band ? "bg-surface-band" : undefined}>
      <div className="mx-auto w-full max-w-site px-4 py-14 sm:px-6 sm:py-20 lg:px-10">
        <div className="grid gap-8 border-t border-rule-strong pt-6 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-4">
            <p aria-hidden="true" className="eyebrow">
              {number}
            </p>
            <h2 id={`${id}-heading`} className="display-section mt-3">
              {title}
            </h2>
            {lead ? <p className="mt-4 max-w-md leading-relaxed text-ink-2">{lead}</p> : null}
          </div>
          <div className="lg:col-span-8">{children}</div>
        </div>
      </div>
    </section>
  );
}
