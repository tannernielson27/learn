import type { Metadata } from "next";
import { TextLink } from "@/components/ui/TextLink";

export const metadata: Metadata = { title: "Help" };

const GUIDES = [
  {
    href: "/help/instructor",
    label: "Teacher guide",
    summary:
      "Quizzes, questions, AI import, classes, assignments, live sessions, reports and practice.",
  },
  {
    href: "/help/items",
    label: "Question guide",
    summary:
      "Every question format, what it tests and how it is scored, with case studies and the six clinical judgment steps.",
  },
] as const;

export default function HelpIndex() {
  return (
    <article className="flex flex-col gap-10">
      <header>
        <p className="eyebrow">Help</p>
        <h1 className="mt-2 font-read text-display leading-tight text-ink-1">Using LeaRN</h1>
      </header>

      <ul className="flex flex-col divide-y divide-line border-y border-line">
        {GUIDES.map((guide) => (
          <li key={guide.href} className="py-3">
            <TextLink href={guide.href}>{guide.label}</TextLink>
            <p className="measure text-ink-2">{guide.summary}</p>
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
              <TextLink href="/join" kind="inline">
                Join
              </TextLink>{" "}
              and type the code, or scan the QR code. No account needed.
            </dd>
          </div>
          <div id="students-class" className="scroll-mt-4">
            <dt className="font-semibold">Join a class</dt>
            <dd className="mt-1">
              Assignments and practice need an account and a class. Open the invite link your
              teacher shares, or scan its QR code, then type your name and email address and choose
              a password. Or{" "}
              <TextLink href="/sign-up" kind="inline">
                create an account
              </TextLink>{" "}
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
