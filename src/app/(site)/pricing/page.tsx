import type { Metadata } from "next";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/Button";
import { textLinkClasses } from "@/components/ui/TextLink";
import { readLandingEntry } from "@/lib/auth/visitor";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site/links";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "One subscription per workspace: $39.99 a month for up to 10 teachers, with a 7-day free " +
    "trial. Free for students.",
};

/** What the subscription is (ADR 0016, owner facts of 2026-10-29). Every line is true today. */
const INCLUDED = [
  "Up to 10 teachers in one workspace, sharing quizzes, classes and results.",
  "A 7-day free trial. You enter a card at checkout, and the subscription starts on its own when the trial ends unless you cancel first.",
  "Free for students. Students never pay and are never asked for a card.",
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
      "When the 7 days end, the card you entered is charged $39.99, then again every month. Cancel before the trial ends and nothing is charged.",
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

/**
 * The public price (#522). One subscription, nothing to compare, so there is no table: the
 * price, what it covers, one action and a few answers. The action is the landing page's own
 * (`landingEntry`), so a signed-in teacher is offered their quizzes rather than a second account.
 *
 * #563: the site's editorial look. The headline and the price sit side by side from 1024px, the
 * price in a ruled column of its own; the questions follow under a near-black rule.
 */
export default async function PricingPage() {
  const entry = await readLandingEntry();

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
            $39.99{" "}
            <span className="block pt-3 font-ui text-lg tracking-normal text-ink-2">
              a month per workspace
            </span>
          </p>
          <ul className="mt-8 flex flex-col divide-y divide-line border-y border-line">
            {INCLUDED.map((line) => (
              <li key={line} className="py-3 leading-relaxed text-ink-1">
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-8">
            <Link
              href={entry.href}
              className={buttonClasses({ variant: "primary", size: "lg", block: true })}
            >
              {entry.label}
            </Link>
          </p>
        </section>
      </div>

      <section aria-labelledby="faq-heading" className="border-t border-rule-strong pt-6">
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12">
          <h2 id="faq-heading" className="display-section lg:col-span-4">
            Common questions
          </h2>
          <dl className="flex flex-col divide-y divide-line text-ink-1 lg:col-span-7 lg:col-start-6">
            {FAQ.map((entry) => (
              <div key={entry.id} className="py-4 first:pt-0">
                <dt className="font-semibold">{entry.question}</dt>
                <dd className="measure mt-1 leading-relaxed text-ink-2">{entry.answer}</dd>
              </div>
            ))}
            <div className="py-4">
              <dt className="font-semibold">Can a school pay for a program?</dt>
              <dd className="measure mt-1 leading-relaxed text-ink-2">
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
