import Link from "next/link";
import { formatSessionDate } from "@/components/live/report/formatDate";
import { StepBars } from "@/components/review/StepBars";
import { EmptyState } from "@/components/ui/EmptyState";
import type { StepShare } from "@/lib/assignments/resultsSummary";
import { attendanceText, cellText, type StudentStep } from "@/lib/classes/progress";
import { progressTabPath } from "@/lib/classes/progress";
import type { StudentProgress } from "@/lib/classes/studentProgress";
import { formatPercent } from "@/lib/live/reportFormat";

export interface StudentProgressViewProps {
  classId: string;
  className: string;
  progress: StudentProgress;
}

const HEADING = "text-lg font-medium text-ink-1";

const KIND_LABELS = { session: "Live session", assignment: "Assignment" } as const;

/** The steps with a percent, in the order given, as the step bars draw them. */
export function studentStepShares(steps: readonly StudentStep[]): StepShare[] {
  return steps.flatMap((step) =>
    step.meanPercent === null
      ? []
      : [
          {
            step: step.step,
            label: step.label,
            percent: Math.round(step.meanPercent),
            questions: step.answered,
          },
        ],
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:px-4 sm:first:pl-0">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className="font-mono text-2xl text-ink-1 tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * One student of a class, for its teacher: their overall percent and attendance, their clinical
 * judgment steps weakest first in the reports' neutral bars, and every class live session and
 * assignment newest first, each with its result in words and a link to its report. Nothing here
 * is about any other student.
 */
export function StudentProgressView({ classId, className, progress }: StudentProgressViewProps) {
  const { student, timeline, steps, sessionsEnded } = progress;
  const shares = studentStepShares(steps);
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-ink-2">
        <Link
          href={progressTabPath(classId)}
          className="tap-target inline-flex items-center hover:text-ink-1"
        >
          {`${className}: Progress`}
        </Link>
      </p>
      <header className="flex flex-col gap-2">
        <p className="eyebrow">Student</p>
        <h1 className="font-read text-display leading-tight break-words text-ink-1">
          {student.name}
        </h1>
        {student.name === student.email ? null : (
          <p className="break-words text-ink-2">{student.email}</p>
        )}
        {student.membership === "removed" ? (
          <p className="max-w-prose text-ink-2">
            Taken off this class. What they did is kept here, and counts in none of the class&apos;s
            figures.
          </p>
        ) : null}
      </header>

      <dl className="grid max-w-reading divide-y divide-line border-y border-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Stat label="Overall" value={formatPercent(student.overallPercent)} />
        <Stat
          label="Live sessions attended"
          value={attendanceText(student.sessionsAttended, sessionsEnded)}
        />
        <Stat label="Assignments submitted" value={String(student.assignmentsSubmitted)} />
      </dl>

      <section
        aria-labelledby="student-steps-heading"
        className="flex max-w-reading flex-col gap-3"
      >
        <h2 id="student-steps-heading" className={HEADING}>
          Clinical judgment steps
        </h2>
        {shares.length === 0 ? (
          <p className="text-ink-2">
            No answered question is tagged with a clinical judgment step yet.
          </p>
        ) : (
          <StepBars
            steps={shares}
            heading="Weakest first"
            headingLevel="h3"
            className="rounded-md border border-line bg-surface-1 p-4 sm:p-6"
          />
        )}
      </section>

      <section aria-labelledby="timeline-heading" className="flex max-w-reading flex-col gap-3">
        <h2 id="timeline-heading" className={HEADING}>
          Live sessions and assignments
        </h2>
        {timeline.length === 0 ? (
          <EmptyState
            level={3}
            heading="Nothing yet"
            body="This class has no live sessions or assignments yet."
          />
        ) : (
          <ol className="flex flex-col divide-y divide-line border-y border-line">
            {timeline.map(({ activity, cell, href, linkLabel }) => (
              <li
                key={activity.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-2 py-3"
              >
                <div className="min-w-0">
                  <p className="text-xs tracking-wide text-ink-2 uppercase">
                    {KIND_LABELS[activity.kind]}
                  </p>
                  <p className="font-medium break-words text-ink-1">{activity.title}</p>
                  <p className="text-sm text-ink-2">
                    {activity.kind === "assignment" ? "Closes " : ""}
                    {formatSessionDate(activity.occurredAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span
                    data-testid="timeline-result"
                    className={`font-mono ${cell.percent === null ? "text-ink-2" : "font-semibold text-ink-1"}`}
                  >
                    {cellText(cell)}
                  </span>
                  <Link
                    href={href}
                    aria-label={`${linkLabel}: ${activity.title}`}
                    className="tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline"
                  >
                    {linkLabel}
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
