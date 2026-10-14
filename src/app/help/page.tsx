import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Help" };

const GUIDES = [
  {
    href: "/help/instructor",
    label: "Teacher guide",
    summary: "Quizzes, questions, classes, assignments, live sessions, reports and practice.",
  },
  {
    href: "/help/items",
    label: "Question guide",
    summary:
      "Every question format, what it tests and how it is scored, with case studies and the six clinical judgment steps.",
  },
] as const;

const LINK = "text-accent-ink underline underline-offset-4";

export default function HelpIndex() {
  return (
    <article className="flex flex-col gap-10">
      <header>
        <p className="eyebrow">Help</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-1 sm:text-3xl">
          Using LeaRN
        </h1>
        <p className="measure mt-3 text-lg text-ink-2">Two guides for teachers.</p>
      </header>

      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {GUIDES.map((guide) => (
          <li key={guide.href} className="py-4">
            <Link
              href={guide.href}
              className="text-lg font-medium text-accent-ink underline-offset-4 hover:underline"
            >
              {guide.label}
            </Link>
            <p className="measure mt-1 text-ink-2">{guide.summary}</p>
          </li>
        ))}
      </ul>

      <section aria-labelledby="students">
        <h2 id="students" className="text-xl font-semibold text-ink-1">
          For students
        </h2>
        <dl className="measure mt-3 flex flex-col gap-4 text-ink-1">
          <div id="students-live" className="scroll-mt-4">
            <dt className="font-semibold">Join a live session</dt>
            <dd className="mt-1">
              Open{" "}
              <Link href="/join" className={LINK}>
                Join
              </Link>{" "}
              and type the six-character join code on the screen, or scan its QR code. You need no
              account.
            </dd>
          </div>
          <div id="students-class" className="scroll-mt-4">
            <dt className="font-semibold">Join a class</dt>
            <dd className="mt-1">
              Assignments and practice need an account and a class. Open the invite link your
              teacher shares, or scan its QR code, then type your name and email address and choose
              a password. Or{" "}
              <Link href="/sign-up" className={LINK}>
                create an account
              </Link>{" "}
              first and type the eight-character class code.
            </dd>
          </div>
          <div id="students-results" className="scroll-mt-4">
            <dt className="font-semibold">See your results</dt>
            <dd className="mt-1">
              An assignment&apos;s scores, answers and rationales appear after it closes.
            </dd>
          </div>
        </dl>
      </section>
    </article>
  );
}
