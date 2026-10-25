import { ClassTime } from "@/components/assignments/ClassTime";
import type { StudentClassInfo } from "@/components/assignments/StudentAssignmentList";
import { EmptyState } from "@/components/ui/EmptyState";
import { classLabel } from "@/lib/classes/studentClasses";
import { DEFAULT_CLASS_TIME_ZONE } from "@/lib/classes/timeZone";
import { answeredLabel, studentLiveResultPath, type LiveHistoryRow } from "@/lib/learn/liveHistory";
import { formatPercent, formatPoints } from "@/lib/live/reportFormat";
import { HOME_LIST_CLASSES, HomeRow } from "./HomeRow";

export interface LiveSessionHistoryProps {
  rows: readonly LiveHistoryRow[];
  /** Class id to name and zone, from the student's own classes. */
  classes: ReadonlyMap<string, StudentClassInfo>;
}

function Score({ row }: { row: LiveHistoryRow }) {
  const percent = row.percent === null ? "" : ` (${formatPercent(row.percent)})`;
  return (
    <p data-testid="live-history-score" className="text-sm text-ink-2">
      {"Score "}
      <span className="tabular font-mono text-base text-ink-1">
        {`${formatPoints(row.points)} of ${formatPoints(row.possible)}${percent}`}
      </span>
    </p>
  );
}

/** The class as the student's own class list names it, or as the session does once they left it. */
function classOf(row: LiveHistoryRow, classes: ReadonlyMap<string, StudentClassInfo>) {
  const info = row.classId === null ? undefined : classes.get(row.classId);
  return {
    label: info ? classLabel(info) : row.className,
    timeZone: info?.timeZone ?? DEFAULT_CLASS_TIME_ZONE,
  };
}

/**
 * A student's ended live sessions on their home page, in the style of the assignment history: most
 * recently ended first, each with their own score, how many questions they answered and a link to
 * the session's results. Only sessions they joined signed in, for their class, are here; a session
 * joined with a code and a name alone is never linked to them. A Server Component: `ClassTime`
 * must be formatted by the server.
 */
export function LiveSessionHistory({ rows, classes }: LiveSessionHistoryProps) {
  if (rows.length === 0) {
    // Under the student home's Live sessions h2.
    return <EmptyState level={3} heading="No live sessions yet" />;
  }

  return (
    <ul aria-label="Live session history" className={HOME_LIST_CLASSES}>
      {rows.map((row) => {
        const { label, timeZone } = classOf(row, classes);
        return (
          <HomeRow
            key={row.id}
            href={studentLiveResultPath(row.id)}
            title={`Results for ${row.title}`}
            end={
              <div className="flex shrink-0 flex-col gap-0.5 sm:items-end sm:text-right">
                <Score row={row} />
                <p className="text-sm text-ink-2">{answeredLabel(row)}</p>
              </div>
            }
          >
            {label ? (
              <>
                <span>{label}</span> ·{" "}
              </>
            ) : null}
            {row.closedAt ? (
              <>
                Ended <ClassTime iso={row.closedAt} timeZone={timeZone} />
              </>
            ) : (
              "Ended"
            )}
          </HomeRow>
        );
      })}
    </ul>
  );
}
