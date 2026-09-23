import Link from "next/link";
import { reportPath } from "@/lib/live/reportFormat";
import type { SessionSummary } from "@/lib/supabase/sessionReport";
import type { SessionStatus } from "@/lib/supabase/sessions";
import { formatSessionDate } from "./formatDate";

const STATUS_LABELS: Record<SessionStatus, string> = {
  lobby: "Lobby",
  running: "Running",
  paused: "Paused",
  ended: "Ended",
};

const participantLabel = (count: number) =>
  count === 1 ? "1 participant" : `${count} participants`;

export interface SessionListProps {
  sessions: readonly SessionSummary[];
}

/**
 * The host's recent sessions (#186). An ended one opens its report; one still open opens its
 * console, since a report of a room that is still answering would be out of date as it loads.
 */
export function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-ink-2">
        No live sessions yet. Start one from a bank, and its report will be listed here once it
        ends.
      </p>
    );
  }

  return (
    <ul
      aria-label="Live sessions"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {sessions.map((session) => (
        <li key={session.id}>
          <Link
            href={session.status === "ended" ? reportPath(session.id) : `/live/${session.id}`}
            className="tap-target flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
          >
            <span className="font-medium text-ink-1">{session.title}</span>
            <span className="flex flex-wrap gap-x-3 text-sm text-ink-2">
              <span>{formatSessionDate(session.closedAt ?? session.openedAt)}</span>
              <span>{participantLabel(session.participantCount)}</span>
              <span className={session.status === "ended" ? "" : "font-medium text-ink-1"}>
                {STATUS_LABELS[session.status]}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
