import type { Metadata } from "next";
import Link from "next/link";
import { sectionNumber } from "@/components/help/HelpGuide";
import { ProblemReportLink } from "@/components/support/ProblemReportLink";
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

// The guide's name is the link: serif at a heading's size, a 44px target, underlined on hover.
const GUIDE_LINK =
  "tap-target inline-flex items-center font-read text-2xl leading-tight text-ink-1 " +
  "underline-offset-[6px] decoration-accent decoration-2 hover:text-accent-ink hover:underline " +
  "sm:text-3xl";

/**
 * The help index as a contents page (#563): the title in the narrow column and the two guides as
 * numbered entries between hairlines in the wide one, then what a student needs under a rule.
 */
export default function HelpIndex() {
  return (
    <article className="flex flex-col gap-16 sm:gap-20">
      <div className="grid gap-6 border-t border-rule-strong pt-6 lg:grid-cols-12 lg:gap-10">
        <header className="lg:col-span-4">
          <p className="eyebrow">Help</p>
          <h1 className="display-section mt-3">Using LeaRN</h1>
        </header>
        <ol className="lg:col-span-8">
          {GUIDES.map((guide, index) => (
            <li
              key={guide.href}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-2 border-b border-line pt-4 pb-5 first:pt-0 sm:grid-cols-[4rem_minmax(0,1fr)] sm:pb-6"
            >
              <span aria-hidden="true" className="tabular font-mono text-sm text-ink-2">
                {sectionNumber(index)}
              </span>
              <div className="min-w-0">
                <Link href={guide.href} className={GUIDE_LINK}>
                  {guide.label}
                </Link>
                <p className="measure mt-1 leading-relaxed text-ink-2">{guide.summary}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <section
        aria-labelledby="students"
        className="grid gap-6 border-t border-rule-strong pt-6 lg:grid-cols-12 lg:gap-10"
      >
        <div className="lg:col-span-4">
          <h2 id="students" className="font-read text-2xl leading-tight text-ink-1 sm:text-3xl">
            For students
          </h2>
        </div>
        <dl className="flex flex-col border-t border-line text-ink-1 lg:col-span-8">
          <div id="students-live" className="scroll-mt-8 border-b border-line py-4">
            <dt className="font-semibold">Join a live session</dt>
            <dd className="measure mt-1 leading-relaxed">
              Open{" "}
              <TextLink href="/join" kind="inline">
                Join
              </TextLink>{" "}
              and type the code, or scan the QR code. No account needed.
            </dd>
          </div>
          <div id="students-class" className="scroll-mt-8 border-b border-line py-4">
            <dt className="font-semibold">Join a class</dt>
            <dd className="measure mt-1 leading-relaxed">
              Assignments and practice need an account and a class. Open the invite link your
              teacher shares, or scan its QR code, then type your name and email address and choose
              a password. Or{" "}
              <TextLink href="/sign-up" kind="inline">
                create an account
              </TextLink>{" "}
              first and type the eight-character class code.
            </dd>
          </div>
          <div id="students-results" className="scroll-mt-8 border-b border-line py-4">
            <dt className="font-semibold">See your results</dt>
            <dd className="measure mt-1 leading-relaxed">
              An assignment&apos;s scores, answers and rationales appear after it closes.
            </dd>
          </div>
        </dl>
      </section>

      {/* #568. The page reads no session, so the form asks who is signed in when it opens. */}
      <section
        aria-labelledby="problem"
        className="grid gap-6 border-t border-rule-strong pt-6 lg:grid-cols-12 lg:gap-10"
      >
        <div className="lg:col-span-4">
          <h2 id="problem" className="font-read text-2xl leading-tight text-ink-1 sm:text-3xl">
            Something not working?
          </h2>
        </div>
        <div className="flex flex-col items-start gap-3 lg:col-span-8">
          <p className="measure leading-relaxed text-ink-1">
            Tell us what you were doing and what went wrong, and we will look into it. Signed in,
            you can send it from here; anyone can email us.
          </p>
          {/* The form once the server says someone is signed in, and the address for everyone. */}
          <ProblemReportLink audience="unknown" />
        </div>
      </section>
    </article>
  );
}
