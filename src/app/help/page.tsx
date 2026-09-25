import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Help" };

const GUIDES = [
  {
    href: "/help/instructor",
    label: "Instructor guide",
    summary:
      "From signing in to reading reports: banks, items, classes, take-home assignments, live sessions and practice.",
  },
  {
    href: "/help/items",
    label: "Item-writing guide",
    summary:
      "Every item format, what it tests and how it is scored, plus case studies, Trend items and the six clinical judgment steps.",
  },
] as const;

export default function HelpIndex() {
  return (
    <article className="flex flex-col gap-10">
      <header>
        <p className="eyebrow">Help</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-1 sm:text-3xl">
          Using LeaRN
        </h1>
        <p className="measure mt-3 text-lg text-ink-2">
          Two short guides for instructors who are setting up on their own.
        </p>
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
        <p className="measure mt-2 text-ink-1">
          Your instructor gives you everything you need. For a live session, open{" "}
          <Link href="/join" className="text-accent-ink underline underline-offset-4">
            Join
          </Link>{" "}
          and type the six-character code on the screen, or scan its QR code; no account is needed.
          For take-home work, use the class invite link your instructor shares, then sign in with
          the link emailed to you. Scores, answers and rationales for an assignment appear after it
          closes.
        </p>
      </section>
    </article>
  );
}
