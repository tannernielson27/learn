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
 */
export default async function PricingPage() {
  const entry = await readLandingEntry();

  return (
    <article className="flex flex-col gap-10">
      <header>
        <p className="eyebrow">Pricing</p>
        <h1 className="mt-2 font-read text-display leading-tight text-ink-1">
          One price for the whole workspace.
        </h1>
        <p className="measure mt-4 text-lg leading-relaxed text-ink-2">
          LeaRN is paid for by the workspace, not by each teacher, and never by students.
        </p>
      </header>

      <section aria-labelledby="price-heading">
        <h2 id="price-heading" className="sr-only">
          Subscription
        </h2>
        <p className="font-read text-display leading-tight text-ink-1">
          $39.99 <span className="font-ui text-lg text-ink-2">a month per workspace</span>
        </p>
        <ul className="measure mt-6 flex flex-col divide-y divide-line border-y border-line">
          {INCLUDED.map((line) => (
            <li key={line} className="py-3 leading-relaxed text-ink-1">
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-8">
          <Link href={entry.href} className={buttonClasses({ variant: "primary", size: "lg" })}>
            {entry.label}
          </Link>
        </p>
      </section>

      <section aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="text-xl font-semibold text-ink-1">
          Common questions
        </h2>
        <dl className="measure mt-3 flex flex-col gap-4 text-ink-1">
          {FAQ.map((entry) => (
            <div key={entry.id}>
              <dt className="font-semibold">{entry.question}</dt>
              <dd className="mt-1 leading-relaxed text-ink-2">{entry.answer}</dd>
            </div>
          ))}
          <div>
            <dt className="font-semibold">Can a school pay for a program?</dt>
            <dd className="mt-1 leading-relaxed text-ink-2">
              Yes. Email{" "}
              <a href={SUPPORT_MAILTO} className={textLinkClasses({ kind: "inline" })}>
                {SUPPORT_EMAIL}
              </a>{" "}
              and we will work out the right setup with you.
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
