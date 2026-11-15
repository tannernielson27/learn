import { AssignmentReportView } from "@/components/assignments/report/AssignmentReportView";
import { SessionList } from "@/components/live/report/SessionList";
import { SessionReportView } from "@/components/live/report/SessionReportView";
import { PageHeader } from "@/components/ui/PageHeader";
import { buildAssignmentReport } from "@/lib/assignments/report";
import {
  assignmentReportGalleryInput,
  REPORT_GALLERY_CLOSED_AT,
  REPORT_GALLERY_TITLE,
  SESSION_REPORT_GALLERY_INPUT,
} from "@/lib/assignments/reportGalleryFixture";
import { buildSessionReport } from "@/lib/live/report";
import type { ReportView } from "@/lib/live/reportFormat";

const STATES = [
  "assignment",
  "assignment-items",
  "assignment-open",
  "assignment-empty",
  "session",
  "session-items",
  "sessions-empty",
] as const;
type ReportsGalleryState = (typeof STATES)[number];

function parseState(value: string | string[] | undefined): ReportsGalleryState {
  return STATES.find((state) => state === value) ?? "assignment";
}

const ASSIGNMENT_ID = "00000000-0000-4000-8000-000000000563";
const CLASS_ID = "00000000-0000-4000-8000-0000000005c3";
const SESSION_ID = "00000000-0000-4000-8000-0000000005e3";

function Demo({ state }: { state: ReportsGalleryState }) {
  if (state === "sessions-empty") {
    // The Live sessions page as it stands with none, its header and all.
    return (
      <div className="flex flex-col gap-10">
        <PageHeader title="Live sessions" lead="Newest first, with each report." />
        <SessionList sessions={[]} />
      </div>
    );
  }
  if (state === "session" || state === "session-items") {
    return (
      <SessionReportView
        sessionId={SESSION_ID}
        title={REPORT_GALLERY_TITLE}
        closedAt={REPORT_GALLERY_CLOSED_AT}
        report={buildSessionReport(SESSION_REPORT_GALLERY_INPUT)}
        view={state === "session" ? "students" : "items"}
      />
    );
  }
  const released = state === "assignment" || state === "assignment-items";
  const input = assignmentReportGalleryInput(released);
  const view: ReportView = state === "assignment-items" ? "items" : "students";
  return (
    <AssignmentReportView
      assignmentId={ASSIGNMENT_ID}
      classId={CLASS_ID}
      title={REPORT_GALLERY_TITLE}
      closesAt={REPORT_GALLERY_CLOSED_AT}
      maxAttempts={2}
      report={buildAssignmentReport(
        state === "assignment-empty" ? { ...input, attempts: [] } : input,
      )}
      view={view}
    />
  );
}

/**
 * The teacher's reports drawn from `reportGalleryFixture.ts`, with no database behind them, so the
 * screenshot suite and the #563 review can see them. `?state=` picks one: `assignment` (closed,
 * the students table, wide enough to scroll), `assignment-items`, `assignment-open` (progress
 * only), `assignment-empty` (nobody has started), `session`, `session-items` and `sessions-empty`
 * (the Live sessions list with none). The view links lead to the real pages' addresses.
 *
 * Opened by URL, not from the gallery nav, as `/gallery/library` is: a nav entry would change the
 * sidebar in every full-page gallery baseline.
 */
export default async function ReportsGallery({ searchParams }: PageProps<"/gallery/reports">) {
  const state = parseState((await searchParams).state);
  return (
    <article>
      <p className="eyebrow">Composites</p>
      {/* Not a heading: the report's title is this page's h1, as it is on the real page. */}
      <p className="mt-2 text-2xl font-semibold">Reports</p>
      <p className="mt-2 mb-8 max-w-prose text-ink-2">
        A teacher&apos;s reports of one fictional quiz, taken by a class of eight as an assignment
        and in a live session. No answer key is in them.
      </p>
      <div data-testid="reports-demo">
        <Demo state={state} />
      </div>
    </article>
  );
}
