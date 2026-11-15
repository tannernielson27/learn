import Link from "next/link";
import { LocalTime } from "@/components/assignments/LocalTime";
import { ReportStepBars } from "@/components/live/report/ReportStepBars";
import { ItemTable, StepTable } from "@/components/live/report/ReportTables";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { assignmentReportCsvPath, assignmentReportPath } from "@/lib/assignments/assignments";
import type { AssignmentReport } from "@/lib/assignments/report";
import { classPath } from "@/lib/classes/classes";
import { REPORT_VIEWS, type ReportView } from "@/lib/live/reportFormat";
import { ProgressTable, ScoreTable } from "./AssignmentStudentTable";

const VIEW_LABELS: Record<ReportView, string> = {
  students: "Students",
  items: "Questions",
  steps: "Clinical judgment steps",
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
      <PageHeader
        title={title}
        back={{ href: classPath(classId), label: "Back to class" }}
        lead={
          <>
            <p>
              {report.released ? "Assignment report, closed " : "Assignment report, closes "}
              <LocalTime iso={closesAt} />
            </p>
            <p className="tabular mt-1 text-base">
              {`${counts.submitted} submitted · ${counts.inProgress} in progress · ${counts.notStarted} not started`}
            </p>
          </>
        }
        action={
          report.released ? (
            <a href={assignmentReportCsvPath(assignmentId)} download className={buttonClasses()}>
              Download CSV
            </a>
          ) : null
        }
      />

      <nav aria-label="Report views" className="mt-6 border-b border-line">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {REPORT_VIEWS.map((option) => (
            <li key={option}>
              <Link
                href={assignmentReportPath(assignmentId, option)}
                aria-current={option === view ? "page" : undefined}
                className={`tap-target inline-flex items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-fast ${
                  option === view
                    ? "border-accent text-accent-ink"
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
        <ReportBody report={report} view={view} maxAttempts={maxAttempts} classId={classId} />
      </section>
    </>
  );
}

/** Said once, where the scores will be: above the progress table, or in place of a view. */
const NOT_CLOSED = "Scores show after it closes.";

/**
 * Nothing to show yet (#563): while it is open, nobody has started; once closed, nobody submitted.
 * Removed students are not counted here; their own group still shows.
 */
function nothingYet(report: AssignmentReport): boolean {
  const { submitted, inProgress } = report.counts;
  return report.released ? submitted === 0 : submitted + inProgress === 0;
}

function NoSubmissions({ report }: { report: AssignmentReport }) {
  return report.released ? (
    <EmptyState
      level={2}
      heading="No submissions"
      body="Nobody submitted before it closed, so there are no scores to show."
    />
  ) : (
    <EmptyState
      level={2}
      heading="No submissions yet"
      body="Each student shows here once they start. Scores show after it closes."
    />
  );
}

function ReportBody({
  report,
  view,
  maxAttempts,
  classId,
}: {
  report: AssignmentReport;
  view: ReportView;
  maxAttempts: number;
  classId: string;
}) {
  if (report.students.length === 0 && report.removed.length === 0) {
    return (
      <EmptyState
        level={2}
        heading="Nobody has joined this class yet"
        body="Students who join the class can start this assignment, and their progress shows here."
        action={{ href: `${classPath(classId)}#invite-heading`, label: "Invite students" }}
      />
    );
  }
  if (view === "students") {
    const empty = report.students.length > 0 && nothingYet(report);
    return (
      <>
        {report.released || empty ? null : <p className="mb-4 text-sm text-ink-2">{NOT_CLOSED}</p>}
        {report.students.length === 0 ? (
          <p className="text-ink-2">Nobody is in this class now.</p>
        ) : empty ? (
          <NoSubmissions report={report} />
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
  if (nothingYet(report)) return <NoSubmissions report={report} />;
  if (!report.released) {
    return <p className="text-ink-2">{NOT_CLOSED}</p>;
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
      <p className="measure mb-3 text-sm text-ink-2">Not counted in the class&apos;s figures.</p>
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
      <p className="text-ink-2">No question in this assignment has a clinical judgment step.</p>
    );
  }
  const untagged = report.items.filter((item) => item.cjmmStep === null).length;
  return (
    <>
      <ReportStepBars steps={report.steps} />
      <StepTable steps={report.steps} />
      {untagged > 0 ? (
        <p className="mt-3 text-sm text-ink-2">
          {`${untagged === 1 ? "1 question" : `${untagged} questions`} without a step ${untagged === 1 ? "is" : "are"} left out.`}
        </p>
      ) : null}
    </>
  );
}
