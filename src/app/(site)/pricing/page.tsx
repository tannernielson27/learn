import type { Metadata } from "next";
import Link from "next/link";
import { Marker } from "@/components/site/Marker";
import { buttonClasses } from "@/components/ui/Button";
import { textLinkClasses } from "@/components/ui/TextLink";
import { readLandingEntry } from "@/lib/auth/visitor";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/site/links";
import { OFFER, trialEntry } from "@/lib/site/offer";

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
 * #563: drawn like the landing page, a time stamp over each part and the price on a ruled card.
 */
export default async function PricingPage() {
  const entry = trialEntry(await readLandingEntry());

  return (
    <article className="flex flex-col gap-10">
      <header>
        <Marker time="1200">Pricing</Marker>
        <h1 className="mt-3 font-read text-display leading-tight text-ink-1">
          One price for the whole workspace.
        </h1>
        <p className="measure mt-4 text-lg leading-relaxed text-ink-2">
          LeaRN is paid for by the workspace, not by each teacher, and never by students.
        </p>
      </header>

      <section
        aria-labelledby="price-heading"
        className="rounded-md border border-line bg-surface-1"
      >
        <h2 id="price-heading" className="sr-only">
          Subscription
        </h2>
        <p className="flex flex-wrap items-baseline gap-x-3 border-b border-line px-5 py-5">
          <span className="font-read text-display leading-none text-ink-1 tabular">
            {OFFER.price}
          </span>{" "}
          <span className="text-lg text-ink-2">{OFFER.per}</span>
        </p>
        <ol className="flex flex-col divide-y divide-line px-5">
          {INCLUDED.map((line, index) => (
            <li key={line} className="flex gap-4 py-3 leading-relaxed text-ink-1">
              <span aria-hidden="true" className="pt-1 font-mono text-xs text-brand tabular">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        <p className="border-t border-line px-5 py-4">
          <Link href={entry.href} className={buttonClasses({ variant: "primary", size: "lg" })}>
            {entry.label}
          </Link>
        </p>
      </section>

      <section aria-labelledby="faq-heading">
        <Marker time="1215">Questions</Marker>
        <h2 id="faq-heading" className="mt-3 text-xl font-semibold text-ink-1">
          Common questions
        </h2>
        <dl className="measure mt-3 flex flex-col divide-y divide-line border-y border-line text-ink-1">
          {FAQ.map((entry) => (
            <div key={entry.id} className="py-4">
              <dt className="font-semibold">{entry.question}</dt>
              <dd className="mt-1 leading-relaxed text-ink-2">{entry.answer}</dd>
            </div>
          ))}
          <div className="py-4">
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
