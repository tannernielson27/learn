import Link from "next/link";
import { attemptsLabel, studentResultsPath } from "@/lib/assignments/assignments";
import type { HistoryRow, HistoryStanding } from "@/lib/assignments/history";
import { DEFAULT_CLASS_TIME_ZONE } from "@/lib/classes/timeZone";
import { formatPercent, formatPoints } from "@/lib/live/reportFormat";
import { ClassTime } from "./ClassTime";
import type { StudentClassInfo } from "./StudentAssignmentList";

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
    return (
      <p className="text-ink-2">
        Nothing has closed yet. Your scores appear here once an assignment closes.
      </p>
    );
  }

  return (
    <ul
      aria-label="Assignment history"
      className="flex flex-col divide-y divide-line border-y border-line"
    >
      {rows.map((row) => {
        const info = classes.get(row.classId);
        return (
          <li
            key={row.id}
            className="flex flex-col gap-2 px-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <Link
                href={studentResultsPath(row.id)}
                className="tap-target inline-flex items-center font-medium break-words text-ink-1 underline decoration-line-strong underline-offset-4 hover:decoration-accent"
              >
                {`Results for ${row.title}`}
              </Link>
              <span className="text-sm text-ink-2">{info?.name ?? "Your class"}</span>
              <span className="text-sm text-ink-2">
                Closed{" "}
                <ClassTime
                  iso={row.closesAt}
                  timeZone={info?.timeZone ?? DEFAULT_CLASS_TIME_ZONE}
                />
              </span>
            </div>
            <div className="flex shrink-0 flex-col gap-1 sm:items-end sm:text-right">
              <Standing standing={row.standing} />
              {row.attemptsUsed > 0 ? (
                <p className="text-sm text-ink-2">
                  {`${row.attemptsUsed} of ${attemptsLabel(row.maxAttempts)} used`}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
