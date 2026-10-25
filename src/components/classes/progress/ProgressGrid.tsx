import Link from "next/link";
import { formatSessionDate } from "@/components/live/report/formatDate";
import { HeatLayer } from "@/components/live/results/parts";
import { classStudentPath } from "@/lib/classes/classes";
import {
  attendanceText,
  cellText,
  heatShare,
  type ProgressActivity,
  type ProgressStudent,
} from "@/lib/classes/progress";
import { formatPercent } from "@/lib/live/reportFormat";

const KIND_LABELS: Record<ProgressActivity["kind"], string> = {
  session: "Live session",
  assignment: "Assignment",
};

export interface ProgressGridProps {
  classId: string;
  /** Names the table and the region it scrolls in. */
  label: string;
  activities: readonly ProgressActivity[];
  /** In the order to draw them. */
  students: readonly ProgressStudent[];
  /** Ended class live sessions: what attendance is out of. */
  sessionsEnded: number;
}

/**
 * Students by activities, a heat map that is a real table (the live results' `HeatTable`, #180):
 * row and column headers a screen reader announces with every cell, and in every cell its words,
 * a percent or what happened instead ("Absent", "Not started"). The shading is the percent again,
 * drawn in the one neutral ink, never red or green, so colour is never the only way to read it;
 * a cell with no percent has none.
 *
 * Each student's attendance and overall percent come first, beside their name, so a phone sees
 * them without scrolling. At 375px the activities scroll sideways inside the table's own
 * focusable region, never the page, and the names stay put while they do.
 */
export function ProgressGrid({
  classId,
  label,
  activities,
  students,
  sessionsEnded,
}: ProgressGridProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-sm border border-line bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <table className="tabular w-full border-collapse text-sm">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 border-b border-line-strong bg-surface-1 px-3 py-2 text-left align-bottom font-medium text-ink-2"
            >
              Student
            </th>
            <th
              scope="col"
              className="border-b border-line-strong px-3 py-2 text-right align-bottom font-medium whitespace-nowrap text-ink-2"
            >
              Overall
            </th>
            <th
              scope="col"
              className="border-b border-line-strong px-3 py-2 text-right align-bottom font-medium whitespace-nowrap text-ink-2"
            >
              Attended
            </th>
            {activities.map((activity) => (
              <th
                key={activity.id}
                scope="col"
                className="min-w-[7.5rem] border-b border-line-strong px-3 py-2 text-left align-bottom font-medium text-ink-2"
              >
                <span className="block text-xs tracking-wide uppercase">
                  {KIND_LABELS[activity.kind]}
                </span>
                <span className="line-clamp-2 max-w-[10rem] break-words text-ink-1">
                  {activity.title}
                </span>
                <span className="block text-xs font-normal">
                  {activity.kind === "assignment" ? "Closes " : ""}
                  {formatSessionDate(activity.occurredAt)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.profileId} className="border-b border-line last:border-b-0">
              <th
                scope="row"
                className="sticky left-0 z-10 max-w-[10rem] bg-surface-1 px-3 py-2 text-left align-middle font-medium break-words sm:max-w-xs"
              >
                <Link
                  href={classStudentPath(classId, student.profileId)}
                  className="tap-target inline-flex items-center text-accent-ink hover:underline"
                >
                  {student.name}
                </Link>
              </th>
              <td className="px-3 py-2 text-right align-middle font-mono font-semibold text-ink-1">
                {formatPercent(student.overallPercent)}
              </td>
              <td className="px-3 py-2 text-right align-middle font-mono whitespace-nowrap text-ink-1">
                {attendanceText(student.sessionsAttended, sessionsEnded)}
              </td>
              {student.cells.map((cell) => (
                <td
                  key={cell.activityId}
                  data-testid="progress-cell"
                  className="relative px-3 py-2 text-center align-middle"
                >
                  <HeatLayer share={heatShare(cell.percent)} />
                  <span
                    className={`relative block whitespace-nowrap ${
                      cell.percent === null ? "text-ink-2" : "font-semibold text-ink-1"
                    }`}
                  >
                    {cellText(cell)}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
