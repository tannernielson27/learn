import Link from "next/link";
import { reportStepShares } from "@/components/live/report/ReportStepBars";
import { StepBars } from "@/components/review/StepBars";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { classProgressCsvPath, classStartPath, classStudentPath } from "@/lib/classes/classes";
import {
  PROGRESS_SORT_LABELS,
  PROGRESS_SORTS,
  progressTabPath,
  sortStudents,
  weakestStudents,
  type ClassProgress,
  type ProgressSort,
} from "@/lib/classes/progress";
import { classTabPath } from "@/lib/classes/classTabs";
import { formatPercent } from "@/lib/live/reportFormat";
import { ProgressGrid } from "./ProgressGrid";

export interface ClassProgressPanelProps {
  classId: string;
  /** Null when it could not be read. */
  progress: ClassProgress | null;
  sort: ProgressSort;
}

const HEADING = "text-lg font-medium text-ink-1";
const SUBHEADING = "text-base font-bold text-ink-1";

/** "3 live sessions" */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Said when the class has nothing to show yet: how a live session comes to count for it. */
export const PROGRESS_EMPTY_BODY =
  "Start a live session for this class: choose a quiz, and students signed in to the class count toward it. Their results show here once it ends, with the class's assignments once they close.";

/**
 * How each student in the class is doing (the class page's Progress tab): the students with the
 * lowest overall percent, the class's mean by clinical judgment step in the reports' bars, and a
 * grid of students by live sessions and assignments, sortable by name or overall in the address.
 * Students taken off the class who left something behind have a grid of their own below, and count
 * in none of the class's figures. A Server Component: sorting is a link, so it needs no script.
 */
export function ClassProgressPanel({ classId, progress, sort }: ClassProgressPanelProps) {
  if (progress === null) {
    return (
      <section aria-labelledby="progress-heading">
        <h2 id="progress-heading" className={`mb-3 ${HEADING}`}>
          Progress
        </h2>
        <Notice role="alert">
          The progress could not be loaded. Reload the page to try again.
        </Notice>
      </section>
    );
  }

  const empty = progress.activities.length === 0;
  const weakest = weakestStudents(progress.students);
  const sessions = progress.activities.filter((a) => a.kind === "session").length;
  const assignments = progress.activities.length - sessions;

  return (
    <section aria-labelledby="progress-heading" className="flex min-w-0 flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id="progress-heading" className={HEADING}>
            Progress
          </h2>
          {empty ? null : (
            <p className="mt-1 text-sm text-ink-2">
              {count(progress.students.length, "student", "students")} ·{" "}
              {count(sessions, "live session", "live sessions")} ·{" "}
              {count(assignments, "assignment", "assignments")}
            </p>
          )}
        </div>
        {empty ? null : (
          <a href={classProgressCsvPath(classId)} download className={buttonClasses()}>
            Download CSV
          </a>
        )}
      </div>

      {empty ? (
        <EmptyState
          level={3}
          heading="No live sessions or assignments yet"
          body={PROGRESS_EMPTY_BODY}
          action={{ href: classStartPath(classId), label: "Start a live session" }}
        />
      ) : progress.students.length === 0 ? (
        <EmptyState
          level={3}
          heading="No students in this class yet"
          body="Students who join the class appear here with their live sessions and assignments."
          action={{ href: classTabPath(classId, "students"), label: "Go to the roster" }}
        />
      ) : (
        <>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-12">
            <section aria-labelledby="weakest-heading" className="flex min-w-0 flex-col gap-3">
              <h3 id="weakest-heading" className={SUBHEADING}>
                Lowest overall
              </h3>
              {weakest.length === 0 ? (
                <p className="text-ink-2">No student has a score yet.</p>
              ) : (
                <ol className="flex flex-col divide-y divide-line border-y border-line">
                  {weakest.map((student) => (
                    <li key={student.profileId}>
                      <Link
                        href={classStudentPath(classId, student.profileId)}
                        className="tap-target flex items-baseline justify-between gap-4 px-2 py-2 transition-colors duration-fast hover:bg-surface-2"
                      >
                        <span className="min-w-0 truncate font-medium text-accent-ink">
                          {student.name}
                        </span>
                        <span className="font-mono text-ink-1">
                          {formatPercent(student.overallPercent)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
              <p className="text-sm text-ink-2">
                Overall is the mean of each live session and closed assignment a student has a score
                for. A live session they missed is counted under Attended, not as nought.
              </p>
            </section>
            <div className="min-w-0">
              {progress.steps.length === 0 ? (
                <p className="text-ink-2">
                  No answered question in this class is tagged with a clinical judgment step yet.
                </p>
              ) : (
                // The reports' step bars, a level down: they sit under this tab's heading.
                <StepBars
                  steps={reportStepShares(progress.steps)}
                  heading="Class mean by clinical judgment step"
                  headingLevel="h3"
                  className="rounded-md border border-line bg-surface-1 p-4 sm:p-6"
                />
              )}
            </div>
          </div>

          <section aria-labelledby="grid-heading" className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
              <h3 id="grid-heading" className={SUBHEADING}>
                By student
              </h3>
              <nav aria-label="Sort students">
                <ul className="flex flex-wrap items-center gap-1 text-sm">
                  <li className="text-ink-2" aria-hidden="true">
                    Sort:
                  </li>
                  {PROGRESS_SORTS.map((option) => (
                    <li key={option}>
                      <Link
                        href={progressTabPath(classId, option)}
                        aria-current={option === sort ? "page" : undefined}
                        className={`tap-target inline-flex items-center rounded-sm px-2 font-medium ${
                          option === sort
                            ? "bg-accent-soft text-accent-ink"
                            : "text-ink-2 hover:text-ink-1"
                        }`}
                      >
                        <span className="sr-only">Sort by</span> {PROGRESS_SORT_LABELS[option]}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
            <ProgressGrid
              classId={classId}
              label="Progress by student"
              activities={progress.activities}
              students={sortStudents(progress.students, sort)}
              sessionsEnded={progress.sessionsEnded}
            />
            <p className="text-sm text-ink-2">
              Each cell is the student&apos;s percent, shaded more for higher. A live session counts
              once it has ended, an assignment once it has closed.
            </p>
          </section>

          {progress.removed.length > 0 ? (
            <section aria-labelledby="removed-heading" className="flex min-w-0 flex-col gap-3">
              <h3 id="removed-heading" className={SUBHEADING}>
                Taken off the class
              </h3>
              <p className="text-sm text-ink-2">
                What they did is kept here and in the CSV. It counts in none of the class&apos;s
                figures.
              </p>
              <ProgressGrid
                classId={classId}
                label="Students taken off the class"
                activities={progress.activities}
                students={sortStudents(progress.removed, sort)}
                sessionsEnded={progress.sessionsEnded}
              />
            </section>
          ) : null}
        </>
      )}
    </section>
  );
}
