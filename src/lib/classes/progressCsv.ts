import { toCsv, type CsvCell } from "@/lib/live/csv";
import { reportCsvFilename } from "@/lib/live/reportCsv";
import { attendanceText, cellText, type ClassProgress, type ProgressActivity } from "./progress";

/** Two decimal places, as a number, so the spreadsheet can still add it up. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/** A column: what it is and its date, so the file reads on its own. */
function activityHeader(activity: ProgressActivity): string {
  const day = activity.occurredAt.slice(0, 10);
  return activity.kind === "session"
    ? `Live session: ${activity.title} (${day})`
    : `Assignment: ${activity.title} (closes ${day})`;
}

/**
 * The class's progress grid as CSV, in the reports' format: one row per student, one column per
 * live session and assignment, oldest first, then attendance and the overall percent. A cell with
 * a score holds the percent as a number; one without holds what the grid says instead ("Absent",
 * "Not started"), so an empty cell never stands for nought. Current members first, then the
 * students taken off the class, as in the assignment CSV. Escaping and the formula-injection guard
 * are `toCsv`'s.
 */
export function classProgressCsv(progress: ClassProgress): string {
  const header: CsvCell[] = [
    "Student",
    "Email",
    ...progress.activities.map(activityHeader),
    "Live sessions attended",
    "Overall percent",
    "Membership",
  ];
  const rows = [...progress.students, ...progress.removed].map((student): CsvCell[] => [
    student.name,
    student.email,
    ...student.cells.map((cell) => (cell.percent === null ? cellText(cell) : round2(cell.percent))),
    attendanceText(student.sessionsAttended, progress.sessionsEnded),
    student.overallPercent === null ? null : round2(student.overallPercent),
    student.membership,
  ]);
  return toCsv([header, ...rows]);
}

/** `nur-310-progress-2026-10-27.csv`: the class's name made safe for the header, and the day. */
export function classProgressCsvFilename(className: string, now: Date): string {
  return reportCsvFilename(`${className} progress`, now.toISOString());
}
