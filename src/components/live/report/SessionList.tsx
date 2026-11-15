import Link from "next/link";
import { reportPath } from "@/lib/live/reportFormat";
import type { SessionSummary } from "@/lib/supabase/sessionReport";
import type { SessionStatus } from "@/lib/supabase/sessions";
import { formatSessionDate } from "./formatDate";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

const STATUS_LABELS: Record<SessionStatus, string> = {
  lobby: "Lobby",
  running: "Running",
  paused: "Paused",
  ended: "Ended",
};

const participantLabel = (count: number) => (count === 1 ? "1 student" : `${count} students`);

export interface SessionListProps {
  sessions: readonly SessionSummary[];
}

/**
 * The host's recent sessions (#186). An ended one opens its report; one still open opens its
 * console, since a report of a room that is still answering would be out of date as it loads.
 */
export function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    // Right under the Live sessions page's h1.
    return (
      <EmptyState
        level={2}
        heading="No live sessions yet"
        action={{ href: "/author", label: "Go to your quizzes" }}
      />
    );
  }

  return <SessionRows label="Live sessions" sessions={sessions} />;
}

/**
 * The Live sessions page's list in date groups (#565): "This week", then a group per month, each
 * under its own heading so a long history reads as a few short lists.
 */
export function GroupedSessionList({
  groups,
}: {
  groups: readonly { label: string; sessions: readonly SessionSummary[] }[];
}) {
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.label} aria-labelledby={groupId(group.label)}>
          <h2
            id={groupId(group.label)}
            className="mb-2 text-sm font-medium tracking-wide text-ink-2 uppercase"
          >
            {group.label}
          </h2>
          <SessionRows label={group.label} sessions={group.sessions} />
        </section>
      ))}
    </div>
  );
}

const groupId = (label: string) => `sessions-${label.toLowerCase().replace(/\s+/g, "-")}`;

function SessionRows({ label, sessions }: { label: string; sessions: readonly SessionSummary[] }) {
  return (
    <ul aria-label={label} className="flex flex-col divide-y divide-line border-y border-line">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link
            href={session.status === "ended" ? reportPath(session.id) : `/live/${session.id}`}
            className="tap-target flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-2 py-3 transition-colors duration-fast hover:bg-surface-2"
          >
            <span className="font-medium text-ink-1">{session.title}</span>
            <span className="flex flex-wrap items-center gap-x-3 text-sm text-ink-2">
              <span>{formatSessionDate(session.closedAt ?? session.openedAt)}</span>
              <span>{participantLabel(session.participantCount)}</span>
              {/* A session still open stands out from the ended ones; a running one is live. */}
              <Badge
                tone={session.status === "ended" ? "neutral" : "accent"}
                live={session.status === "running"}
              >
                {STATUS_LABELS[session.status]}
              </Badge>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
