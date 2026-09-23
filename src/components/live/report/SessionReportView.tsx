import Link from "next/link";
import type { SessionReport } from "@/lib/live/report";
import {
  REPORT_VIEWS,
  reportCsvPath,
  reportPath,
  SESSIONS_PATH,
  type ReportView,
} from "@/lib/live/reportFormat";
import { formatSessionDate } from "./formatDate";
import { ItemTable, StepTable, StudentTable } from "./ReportTables";

const VIEW_LABELS: Record<ReportView, string> = {
  students: "Students",
  items: "Items",
  steps: "CJMM steps",
};

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
      <p className="mb-2 text-sm text-ink-2">
        <Link href={SESSIONS_PATH} className="tap-target inline-flex items-center hover:text-ink-1">
          Back to sessions
        </Link>
      </p>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-read text-3xl break-words text-ink-1">{title}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {closedAt ? `Ended ${formatSessionDate(closedAt)}` : "Ended"} ·{" "}
            {report.students.length === 1
              ? "1 participant"
              : `${report.students.length} participants`}{" "}
            · {report.items.length === 1 ? "1 item" : `${report.items.length} items`}
          </p>
        </div>
        <a
          href={reportCsvPath(sessionId)}
          download
          className="tap-target inline-flex items-center rounded-sm border border-line bg-surface-1 px-4 font-medium text-ink-1 transition-colors duration-fast hover:border-line-strong hover:bg-surface-2"
        >
          Download CSV
        </a>
      </header>

      <nav aria-label="Report views" className="mt-6 border-b border-line">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {REPORT_VIEWS.map((option) => (
            <li key={option}>
              <Link
                href={reportPath(sessionId, option)}
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
        <ReportBody report={report} view={view} />
      </section>
    </>
  );
}

function ReportBody({ report, view }: { report: SessionReport; view: ReportView }) {
  if (view === "steps") return <StepsBody report={report} />;
  if (report.students.length === 0) {
    return <p className="text-ink-2">Nobody joined this session.</p>;
  }
  if (view === "items") {
    return <ItemTable items={report.items} participantCount={report.students.length} />;
  }
  return <StudentTable items={report.items} students={report.students} />;
}

function StepsBody({ report }: { report: SessionReport }) {
  if (report.steps.length === 0) {
    return (
      <p className="text-ink-2">
        No item in this session is tagged with a CJMM step, so there is nothing to show by step. Tag
        items with a step in the bank to see this view next time.
      </p>
    );
  }
  const untagged = report.items.filter((item) => item.cjmmStep === null).length;
  return (
    <>
      <StepTable steps={report.steps} />
      <p className="mt-3 text-sm text-ink-2">
        Each step is the mean of its items&apos; mean percents.
        {untagged > 0
          ? ` ${untagged === 1 ? "1 item" : `${untagged} items`} without a step ${untagged === 1 ? "is" : "are"} left out.`
          : ""}
      </p>
    </>
  );
}
