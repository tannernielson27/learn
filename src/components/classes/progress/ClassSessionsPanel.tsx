import { SessionList } from "@/components/live/report/SessionList";
import { EmptyState } from "@/components/ui/EmptyState";
import { Notice } from "@/components/ui/Notice";
import { classStartPath } from "@/lib/classes/classes";
import type { SessionSummary } from "@/lib/supabase/sessionReport";
import { PROGRESS_EMPTY_BODY } from "./ClassProgressPanel";

export interface ClassSessionsPanelProps {
  classId: string;
  /** Newest first; null when they could not be read. */
  sessions: readonly SessionSummary[] | null;
}

const HEADING = "text-lg font-medium text-ink-1";

/**
 * The class's live sessions (the class page's Live sessions tab), as the Live sessions page lists
 * a teacher's: an ended one opens its report, one still open opens the live session. Only
 * sessions started for this class (ADR 0013) are here; a quick live session belongs to no class.
 */
export function ClassSessionsPanel({ classId, sessions }: ClassSessionsPanelProps) {
  return (
    <section aria-labelledby="sessions-heading" className="flex max-w-reading flex-col gap-4">
      {/* "Start a live session" is in the class header, above the tabs. */}
      <h2 id="sessions-heading" className={HEADING}>
        Live sessions
      </h2>
      {sessions === null ? (
        <Notice role="alert">
          The live sessions could not be loaded. Reload the page to try again.
        </Notice>
      ) : sessions.length === 0 ? (
        <EmptyState
          level={3}
          heading="No live sessions for this class yet"
          body={PROGRESS_EMPTY_BODY}
          action={{ href: classStartPath(classId), label: "Choose a quiz to start" }}
        />
      ) : (
        <SessionList sessions={sessions} />
      )}
    </section>
  );
}
