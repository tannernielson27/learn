import Link from "next/link";
import { LocalTime } from "@/components/assignments/LocalTime";
import { ItemTable, StepTable } from "@/components/live/report/ReportTables";
import { assignmentReportCsvPath, assignmentReportPath } from "@/lib/assignments/assignments";
import type { AssignmentReport } from "@/lib/assignments/report";
import { classPath } from "@/lib/classes/classes";
import { REPORT_VIEWS, type ReportView } from "@/lib/live/reportFormat";
import { ProgressTable, ScoreTable } from "./AssignmentStudentTable";

const VIEW_LABELS: Record<ReportView, string> = {
  students: "Students",
  items: "Items",
  steps: "CJMM steps",
};

export interface AssignmentReportViewProps {
  assignmentId: string;
  classId: string;
  title: string;
  closesAt: string;
  maxAttempts: number;
  report: AssignmentReport;
  view: ReportView;
}

/**
 * An assignment's report (#211), shaped like the session report (#186): three views kept in the
 * address, so switching needs no script. A Server Component.
 *
 * Before the close the report is progress only — status and attempts used, no score, no CSV — so
 * an instructor can project it mid-window. The report it is handed carries no scores then either
 * (`released: false`), so this is the second place the rule holds, not the only one.
 */
export function AssignmentReportView({
  assignmentId,
  classId,
  title,
  closesAt,
  maxAttempts,
  report,
  view,
}: AssignmentReportViewProps) {
  const { counts } = report;
  return (
    <>
      <p className="mb-2 text-sm text-ink-2">
        <Link
          href={classPath(classId)}
          className="tap-target inline-flex items-center hover:text-ink-1"
        >
          Back to class
        </Link>
      </p>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="eyebrow mb-2">Assignment report</p>
          <h1 className="font-read text-3xl break-words text-ink-1">{title}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {report.released ? "Closed " : "Closes "}
            <LocalTime iso={closesAt} />
          </p>
          <p className="mt-1 text-sm text-ink-2">
            {`${counts.submitted} submitted · ${counts.inProgress} in progress · ${counts.notStarted} not started`}
          </p>
        </div>
        {report.released ? (
          <a
            href={assignmentReportCsvPath(assignmentId)}
            download
            className="tap-target inline-flex items-center rounded-sm border border-line bg-surface-1 px-4 font-medium text-ink-1 transition-colors duration-fast hover:border-line-strong hover:bg-surface-2"
          >
            Download CSV
          </a>
        ) : null}
      </header>

      {report.released ? null : (
        <p role="status" className="measure mt-4 text-sm text-ink-2">
          Scores show here once the assignment closes. Until then this shows who has started and who
          has submitted, so it is safe to project.
        </p>
      )}

      <nav aria-label="Report views" className="mt-6 border-b border-line">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {REPORT_VIEWS.map((option) => (
            <li key={option}>
              <Link
                href={assignmentReportPath(assignmentId, option)}
                aria-current={option === view ? "page" : undefined}
                className={`tap-target inline-flex items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors duration-fast ${
                  option === view
                    ? "border-accent text-ink-1"
                    : "border-transparent text-ink-2 hover:text-ink-1"
                }`}
              >
                {VIEW_LABELS[option]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label={VIEW_LABELS[view]} className="mt-6">
        <ReportBody report={report} view={view} maxAttempts={maxAttempts} />
      </section>
    </>
  );
}

function ReportBody({
  report,
  view,
  maxAttempts,
}: {
  report: AssignmentReport;
  view: ReportView;
  maxAttempts: number;
}) {
  if (report.students.length === 0 && report.removed.length === 0) {
    return <p className="text-ink-2">Nobody has joined this class yet.</p>;
  }
  if (view === "students") {
    return (
      <>
        {report.students.length === 0 ? (
          <p className="text-ink-2">Nobody is in this class now.</p>
        ) : (
          <StudentTable report={report} students={report.students} maxAttempts={maxAttempts} />
        )}
        {report.removed.length > 0 ? (
          <RemovedGroup report={report} maxAttempts={maxAttempts} />
        ) : null}
      </>
    );
  }
  if (report.students.length === 0) {
    return <p className="text-ink-2">Nobody is in this class now.</p>;
  }
  if (!report.released) {
    return <p className="text-ink-2">Scores show here once the assignment closes.</p>;
  }
  if (view === "items") {
    return (
      <ItemTable items={report.items} participantCount={report.students.length} correctColumn />
    );
  }
  return <StepsBody report={report} />;
}

function StudentTable({
  report,
  students,
  maxAttempts,
  label,
}: {
  report: AssignmentReport;
  students: AssignmentReport["students"];
  maxAttempts: number;
  label?: string;
}) {
  return report.released ? (
    <ScoreTable
      items={report.items}
      students={students}
      maxAttempts={maxAttempts}
      label={label ?? "Scores by student"}
    />
  ) : (
    <ProgressTable
      students={students}
      maxAttempts={maxAttempts}
      label={label ?? "Progress by student"}
    />
  );
}

/**
 * Students taken off the class after attempting (#242): their work is kept and shown here, by the
 * same rules as everyone else's (progress only until the close), and left out of the class's own
 * counts, items and steps.
 */
function RemovedGroup({ report, maxAttempts }: { report: AssignmentReport; maxAttempts: number }) {
  return (
    <section aria-labelledby="removed-heading" className="mt-8">
      <h2 id="removed-heading" className="mb-1 text-lg font-medium text-ink-1">
        Removed from class
      </h2>
      <p className="measure mb-3 text-sm text-ink-2">
        Taken off the class after attempting this assignment. Their attempts are kept here and are
        not counted in the class&apos;s figures.
      </p>
      <StudentTable
        report={report}
        students={report.removed}
        maxAttempts={maxAttempts}
        label={report.released ? "Scores of removed students" : "Progress of removed students"}
      />
    </section>
  );
}

function StepsBody({ report }: { report: AssignmentReport }) {
  if (report.steps.length === 0) {
    return (
      <p className="text-ink-2">
        No item in this assignment is tagged with a CJMM step, so there is nothing to show by step.
      </p>
    );
  }
  const untagged = report.items.filter((item) => item.cjmmStep === null).length;
  return (
    <>
      <StepTable steps={report.steps} />
      <p className="mt-3 text-sm text-ink-2">
        Each step is the mean of its items&apos; mean percents, from each student&apos;s best
        attempt.
        {untagged > 0
          ? ` ${untagged === 1 ? "1 item" : `${untagged} items`} without a step ${untagged === 1 ? "is" : "are"} left out.`
          : ""}
      </p>
    </>
  );
}
