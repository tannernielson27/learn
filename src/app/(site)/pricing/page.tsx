import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { textLinkClasses } from "@/components/ui/TextLink";
import { SIGN_UP_PATH } from "@/lib/auth/accountPaths";
import { readLandingEntry } from "@/lib/auth/visitor";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site/links";
import {
  OFFER_DESCRIPTION,
  OFFER_PERIOD,
  OFFER_PRICE,
  OFFER_STUDENTS_FREE,
  OFFER_TEACHER_CAP,
  OFFER_TRIAL,
  OFFER_TRIAL_DAYS,
  OFFER_TRIAL_TERMS,
} from "@/lib/site/offer";

export const metadata: Metadata = {
  title: "Pricing",
  description: OFFER_DESCRIPTION,
};

/**
 * What the subscription is (ADR 0016, owner facts of 2026-10-29). Every line is true today. The
 * trial's terms are not repeated here: they sit under the button, where the choice is made.
 */
const INCLUDED = [
  `${OFFER_TEACHER_CAP}, sharing quizzes, classes and results.`,
  `A ${OFFER_TRIAL}, one per person and per workspace.`,
  `${OFFER_STUDENTS_FREE}. Students never pay and are never asked for a card.`,
  "Cancel any time from Manage billing.",
] as const;

const FAQ = [
  {
    id: "students",
    question: "Do students pay?",
    answer:
      "No. Students never pay. They join a live session with a join code, or join a class with a free account of their own.",
  },
  {
    id: "after-trial",
    question: "What happens after the free trial?",
    answer:
      `When the ${OFFER_TRIAL_DAYS} days end, the card you entered is charged ${OFFER_PRICE}, then ` +
      "again every month. Cancel before the trial ends and nothing is charged.",
  },
  {
    id: "cancel",
    question: "How do I cancel?",
    answer:
      "The teacher who started the workspace opens Manage billing in the Billing section of the workspace page. Access lasts to the end of the month already paid for, and there are no refunds for part of a month.",
  },
  {
    id: "lapsed",
    question: "What happens if the subscription ends?",
    answer:
      "The workspace becomes read-only for teachers: every quiz, class and result can still be read, but nothing new can be created or started. Assignments already open run to their close, and nothing is deleted.",
  },
] as const;

// A question in the serif, as the landing page sets its small heads; its answer at reading width.
const QUESTION = "font-read text-xl leading-snug text-ink-1";
const ANSWER = "measure mt-2 leading-relaxed text-ink-2";

/**
 * The public price (#522). One subscription, nothing to compare, so there is no table: the
 * price, one action with what it commits to, what the price covers, and a few answers. The action is the landing page's own
 * (`landingEntry`), so a signed-in teacher is offered their quizzes rather than a second account.
 *
 * #563: the site's editorial look. The headline and the price sit side by side from 1024px, the
 * price in a ruled column of its own; the questions follow under a near-black rule. The offer's
 * facts come from `@/lib/site/offer`, which the landing page reads too.
 */
export default async function PricingPage() {
  const entry = await readLandingEntry();
  // A signed-in teacher is offered their quizzes, which commits to nothing; only the free trial
  // button carries its terms.
  const isTrial = entry.href === SIGN_UP_PATH;

  return (
    <article className="flex flex-col gap-16 sm:gap-20">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <header className="lg:col-span-6">
          <p className="eyebrow">Pricing</p>
          <h1 className="display-section mt-4">One price for the whole workspace.</h1>
          <p className="measure mt-6 text-lg leading-relaxed text-ink-2">
            LeaRN is paid for by the workspace, not by each teacher, and never by students.
          </p>
        </header>

        <section
          aria-labelledby="price-heading"
          className="border-t border-rule-strong pt-6 lg:col-span-5 lg:col-start-8 lg:mt-3"
        >
          <h2 id="price-heading" className="sr-only">
            Subscription
          </h2>
          <p className="display-hero">
            {OFFER_PRICE}{" "}
            <span className="block pt-3 font-ui text-lg tracking-normal text-ink-2">
              {OFFER_PERIOD}
            </span>
          </p>
          {/* The action and what it commits to, together: on a phone both sit in the first screen. */}
          <div className="mt-8">
            <Link
              href={entry.href}
              aria-describedby={isTrial ? "trial-terms" : undefined}
              className={buttonClasses({ variant: "primary", size: "lg", block: true })}
            >
              {entry.label}
            </Link>
            {isTrial ? (
              <p id="trial-terms" className="mt-3 text-sm leading-relaxed text-ink-2">
                {OFFER_TRIAL_TERMS}
              </p>
            ) : null}
          </div>
          <ul className="mt-8 flex flex-col divide-y divide-line border-y border-line">
            {INCLUDED.map((line) => (
              <li key={line} className="py-3 leading-relaxed text-ink-1">
                {line}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="faq-heading" className="border-t border-rule-strong pt-6">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <h2 id="faq-heading" className="display-section lg:col-span-4">
            Common questions
          </h2>
          <dl className="flex flex-col divide-y divide-line text-ink-1 lg:col-span-7 lg:col-start-6">
            {FAQ.map((item) => (
              <div key={item.id} className="py-5 first:pt-0">
                <dt className={QUESTION}>{item.question}</dt>
                <dd className={ANSWER}>{item.answer}</dd>
              </div>
            ))}
            <div className="pt-5">
              <dt className={QUESTION}>Can a school pay for a program?</dt>
              <dd className={ANSWER}>
                Yes. Email{" "}
                <a href={SUPPORT_MAILTO} className={textLinkClasses({ kind: "inline" })}>
                  {SUPPORT_EMAIL}
                </a>{" "}
                and we will work out the right setup with you.
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </article>
  );
}
