import Link from "next/link";
import { brandButtonClasses } from "@/components/site/brandButton";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { TextLink } from "@/components/ui/TextLink";
import type { LandingEntry } from "@/lib/auth/landing";
import { PRICING_PATH } from "@/lib/site/links";
import { JoinCodeForm } from "./JoinCodeForm";
import { LiveClassDemo } from "./LiveClassDemo";
import {
  CASE_STUDY_LINE,
  FORMATS,
  HOW_IT_WORKS,
  PRICE,
  PRICE_FACTS,
  WHO_FOR,
  WORK_ON_THEIR_OWN,
} from "./landingCopy";

export interface LandingProps {
  /** Start your free trial and Sign in for a visitor, or the signed-in visitor's own home. */
  entry: LandingEntry;
}

/** A paper section's heading column and its content, on the page's 12-column grid from 1024px. */
function PaperSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="mx-auto grid w-full max-w-wide gap-6 px-5 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8"
    >
      <div className="border-t-2 border-ink-1 pt-4 lg:col-span-4">
        <h2
          id={id}
          className="text-section leading-[1.05] font-bold tracking-display text-balance text-ink-1"
        >
          {title}
        </h2>
      </div>
      <div className="lg:col-span-8 lg:border-t lg:border-line lg:pt-4">{children}</div>
    </section>
  );
}

/**
 * The public front page (#563, direction B "Lit screen"). A full-bleed navy band, the brand
 * surface, holds the bar, the headline for a teacher with Start your free trial and Sign in, the
 * student's join code form, and the projector lit inside it with phones in front of its edge.
 * Below it, paper on a strict grid: who it is for, how a live session works with large numerals,
 * every format, assignments and practice, and the price. The band comes back once at the foot for
 * the last call to action. Every claim is true today; nothing here is a quote or a number of users.
 *
 * Static apart from `entry`. No question component renders here, and the picture carries no key.
 */
export function Landing({ entry }: LandingProps) {
  const visitor = entry.also !== undefined;
  return (
    <>
      <div data-surface="brand" className="bg-brand-surface text-brand-ink">
        <SiteHeader />
      </div>
      <main className="flex flex-1 flex-col">
        <section
          data-surface="brand"
          aria-labelledby="hero-heading"
          className="bg-brand-surface text-brand-ink"
        >
          <div className="mx-auto grid w-full max-w-wide gap-12 px-5 pt-6 pb-16 sm:px-6 sm:pt-12 lg:grid-cols-[minmax(0,11fr)_minmax(0,13fr)] lg:items-center lg:gap-12 lg:px-8 lg:pt-16 lg:pb-0">
            <div className="lg:pb-24">
              <p className="text-sm font-semibold text-brand-ink-2">{WHO_FOR.eyebrow}</p>
              <h1
                id="hero-heading"
                className="mt-3 text-hero leading-[1.02] font-bold tracking-display text-brand-ink"
              >
                Next Generation NCLEX quizzes, live in class.
              </h1>
              <p className="mt-4 max-w-[34rem] text-lg leading-relaxed text-brand-ink-2 sm:mt-6 sm:text-xl">
                Students answer on their phones. Every question is scored the way the exam scores
                it.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 sm:mt-8 sm:gap-3">
                <Link href={entry.href} className={brandButtonClasses("solid")}>
                  {entry.label}
                </Link>
                {entry.also ? (
                  <Link href={entry.also.href} className={brandButtonClasses("outline")}>
                    {entry.also.label}
                  </Link>
                ) : null}
              </div>
              {visitor ? (
                <p className="mt-3 text-sm text-brand-ink-2">
                  7 days free, then {PRICE} a month per workspace.
                </p>
              ) : null}
              {/* The student's door, on a paper card of its own: the site's field and Join. */}
              <div
                data-surface="paper"
                className="mt-6 max-w-md rounded-md border border-line bg-surface-1 p-4 text-ink-1 sm:mt-10"
              >
                <JoinCodeForm />
              </div>
            </div>
            {/* From 1024px the phones stand below the band's edge, into the paper. */}
            <div className="relative z-10 lg:-mb-16 lg:self-end">
              <LiveClassDemo />
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-20 py-20 sm:gap-28 sm:py-24 lg:pt-36">
          <section
            aria-labelledby="who-heading"
            className="mx-auto grid w-full max-w-wide gap-6 px-5 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8"
          >
            <h2 id="who-heading" className="sr-only">
              Who it is for
            </h2>
            <p className="text-section leading-[1.1] font-bold tracking-display text-balance text-ink-1 lg:col-span-10">
              {WHO_FOR.statement}
            </p>
            <p className="max-w-prose text-lg leading-relaxed text-ink-2 lg:col-span-6 lg:col-start-5">
              {WHO_FOR.detail}
            </p>
          </section>

          <PaperSection id="how-heading" title="How a live session works">
            <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
              {HOW_IT_WORKS.map((step, index) => (
                <li key={step.title} className="flex gap-5 sm:flex-col sm:gap-3">
                  <span
                    aria-hidden="true"
                    className="w-[1.2ch] shrink-0 text-numeral leading-[0.85] font-bold tracking-display text-ink-1 tabular"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-xl leading-snug font-semibold text-ink-1">
                      <span className="sr-only">{`Step ${index + 1}: `}</span>
                      {step.title}
                    </h3>
                    <p className="mt-2 max-w-prose leading-relaxed text-ink-2">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </PaperSection>

          <PaperSection id="formats-heading" title="Every Next Generation NCLEX format">
            <p className="max-w-prose text-lg leading-relaxed text-ink-2">
              Students answer in the layout they will see on the exam, and each format is scored by
              the exam’s own rules.
            </p>
            <ul className="mt-8 grid grid-cols-1 border-t border-line min-[420px]:grid-cols-2 md:grid-cols-4">
              {FORMATS.map((format, index) => (
                <li
                  key={format}
                  className="flex items-baseline gap-3 border-b border-line py-4 pr-4 font-semibold text-ink-1"
                >
                  <span aria-hidden="true" className="font-mono text-sm text-ink-2 tabular">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {format}
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-prose leading-relaxed text-ink-1">
              <span className="font-semibold">Case studies.</span>{" "}
              <span className="text-ink-2">{CASE_STUDY_LINE}</span>
            </p>
          </PaperSection>

          <PaperSection id="own-time-heading" title="Assignments and practice">
            <dl className="grid gap-8 sm:grid-cols-2">
              {WORK_ON_THEIR_OWN.map((row) => (
                <div key={row.term}>
                  <dt className="text-xl font-semibold text-ink-1">{row.term}</dt>
                  <dd className="mt-2 max-w-prose leading-relaxed text-ink-2">{row.detail}</dd>
                </div>
              ))}
            </dl>
          </PaperSection>

          <PaperSection id="price-heading" title="Pricing">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-numeral leading-none font-bold tracking-display text-ink-1 tabular">
                {PRICE}
              </span>
              <span className="text-lg text-ink-2">a month per workspace</span>
            </p>
            <ul className="mt-6 grid max-w-2xl gap-x-8 border-t border-line sm:grid-cols-3">
              {PRICE_FACTS.map((fact) => (
                <li key={fact} className="border-b border-line py-3 leading-relaxed text-ink-1">
                  {fact}
                </li>
              ))}
            </ul>
            <p className="mt-6">
              <TextLink href={PRICING_PATH}>See pricing</TextLink>
            </p>
          </PaperSection>
        </div>

        <section
          data-surface="brand"
          aria-labelledby="start-heading"
          className="bg-brand-surface text-brand-ink"
        >
          <div className="mx-auto grid w-full max-w-wide gap-8 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-12 lg:items-end lg:px-8">
            <h2
              id="start-heading"
              className="text-section leading-[1.05] font-bold tracking-display text-balance lg:col-span-7"
            >
              Bring your next class into a live session.
            </h2>
            <div className="flex flex-wrap gap-2 sm:gap-3 lg:col-span-5 lg:justify-end">
              <Link href={entry.href} className={brandButtonClasses("solid")}>
                {entry.label}
              </Link>
              <Link href={PRICING_PATH} className={brandButtonClasses("outline")}>
                See pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
