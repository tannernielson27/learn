import { buttonClasses } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { TabLinks } from "@/components/ui/TabLinks";
import type { SessionReport } from "@/lib/live/report";
import {
  REPORT_VIEWS,
  reportCsvPath,
  reportPath,
  SESSIONS_PATH,
  type ReportView,
} from "@/lib/live/reportFormat";
import { formatSessionDate } from "./formatDate";
import { ReportStepBars } from "./ReportStepBars";
import { ItemTable, StepTable, StudentTable } from "./ReportTables";

const VIEW_LABELS: Record<ReportView, string> = {
  students: "Students",
  items: "Questions",
  steps: "Clinical judgment steps",
};

/** The way back from a report, open or ended, to the list it was opened from. */
export const REPORT_BACK = { href: SESSIONS_PATH, label: "Back to live sessions" } as const;

export interface SessionReportViewProps {
  sessionId: string;
  title: string;
  closedAt: string | null;
  report: SessionReport;
  view: ReportView;
}

/**
 * An ended session's report (#186). A Server Component: the three views are links, so switching
 * needs no script and the view survives a reload or a shared link.
 *
 * Display names are the only identity on the page. The per-item view counts full, partial and no
 * marks from the scores; the answer distribution from #189 can join it once that lands.
 */
export function SessionReportView({
  sessionId,
  title,
  closedAt,
  report,
  view,
}: SessionReportViewProps) {
  return (
    <>
      <PageHeader
        back={REPORT_BACK}
        title={title}
        lead={
          <p className="text-sm">
            {closedAt ? formatSessionDate(closedAt) : "Ended"} ·{" "}
            {report.students.length === 1 ? "1 student" : `${report.students.length} students`} ·{" "}
            {report.items.length === 1 ? "1 question" : `${report.items.length} questions`}
          </p>
        }
        action={
          <a href={reportCsvPath(sessionId)} download className={buttonClasses()}>
            Download CSV
          </a>
        }
      />

      <TabLinks
        label="Report views"
        className="mt-6"
        links={REPORT_VIEWS.map((option) => ({
          href: reportPath(sessionId, option),
          label: VIEW_LABELS[option],
          current: option === view,
        }))}
      />

      <section aria-label={VIEW_LABELS[view]} className="mt-6">
        <ReportBody report={report} view={view} />
      </section>
    </>
  );
}

function ReportBody({ report, view }: { report: SessionReport; view: ReportView }) {
  if (view === "steps") return <StepsBody report={report} />;
  if (report.students.length === 0) {
    return <p className="text-ink-2">Nobody joined.</p>;
  }
  if (view === "items") {
    return <ItemTable items={report.items} participantCount={report.students.length} />;
  }
  return <StudentTable items={report.items} students={report.students} />;
}

function StepsBody({ report }: { report: SessionReport }) {
  if (report.steps.length === 0) {
    return <p className="text-ink-2">No questions are tagged with a clinical judgment step.</p>;
  }
  // How a step's percent is worked out is in the teacher guide (#reports), not under the table.
  const untagged = report.items.filter((item) => item.cjmmStep === null).length;
  return (
    <>
      <ReportStepBars steps={report.steps} />
      <StepTable steps={report.steps} />
      {untagged > 0 ? (
        <p className="mt-3 text-sm text-ink-2">
          {untagged === 1 ? "1 question" : `${untagged} questions`} without a step{" "}
          {untagged === 1 ? "is" : "are"} left out.
        </p>
      ) : null}
    </>
  );
}
