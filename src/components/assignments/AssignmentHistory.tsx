import { attemptsLabel, studentResultsPath } from "@/lib/assignments/assignments";
import type { HistoryRow, HistoryStanding } from "@/lib/assignments/history";
import { classLabel } from "@/lib/classes/studentClasses";
import { DEFAULT_CLASS_TIME_ZONE } from "@/lib/classes/timeZone";
import { formatPercent, formatPoints } from "@/lib/live/reportFormat";
import { ClassTime } from "./ClassTime";
import type { StudentClassInfo } from "./StudentAssignmentList";
import { HOME_LIST_CLASSES, HomeRow } from "@/components/learn/HomeRow";
import { EmptyState } from "@/components/ui/EmptyState";

export interface AssignmentHistoryProps {
  rows: readonly HistoryRow[];
  /** Class id to name and zone, from the student's own classes. */
  classes: ReadonlyMap<string, StudentClassInfo>;
}

function Standing({ standing }: { standing: HistoryStanding }) {
  if (standing.kind === "not_attempted") {
    return <p className="text-sm text-ink-2">Not attempted</p>;
  }
  if (standing.kind === "unmarked") {
    return <p className="text-sm text-ink-2">Not marked yet</p>;
  }
  const { best } = standing;
  const percent = best.percent === null ? "" : ` (${formatPercent(best.percent)})`;
  return (
    <p data-testid="history-score" className="text-sm text-ink-2">
      {"Best score "}
      <span className="tabular font-mono text-base text-ink-1">
        {`${formatPoints(best.score)} of ${formatPoints(best.maxScore)}${percent}`}
      </span>
    </p>
  );
}

/**
 * A student's history (#238): every closed assignment in their current classes, most recently
 * closed first, with their best score, the attempts they used and a link to the results (#210).
 * A Server Component: `ClassTime` must be formatted by the server.
 */
export function AssignmentHistory({ rows, classes }: AssignmentHistoryProps) {
  if (rows.length === 0) {
    // Under the student home's Results h2.
    return <EmptyState level={3} heading="No closed assignments yet" />;
  }

  return (
    <ul aria-label="Assignment history" className={HOME_LIST_CLASSES}>
      {rows.map((row) => {
        const info = classes.get(row.classId);
        return (
          <HomeRow
            key={row.id}
            href={studentResultsPath(row.id)}
            title={`Results for ${row.title}`}
            end={
              <div className="flex shrink-0 flex-col gap-0.5 sm:items-end sm:text-right">
                <Standing standing={row.standing} />
                {row.attemptsUsed > 0 ? (
                  <p className="text-sm text-ink-2">
                    {`${row.attemptsUsed} of ${attemptsLabel(row.maxAttempts)} used`}
                  </p>
                ) : null}
              </div>
            }
          >
            <span>{classLabel(info)}</span> · Closed{" "}
            <ClassTime iso={row.closesAt} timeZone={info?.timeZone ?? DEFAULT_CLASS_TIME_ZONE} />
          </HomeRow>
        );
      })}
    </ul>
  );
}
