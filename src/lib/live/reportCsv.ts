import { toCsv, type CsvCell } from "./csv";
import type { SessionReport } from "./report";

/** Two decimal places, as a number, so the spreadsheet can still add it up. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The gradebook export (#186): one row per student, one column per item, then the totals. An item
 * the student did not answer is an empty cell, not a zero, so the file says what happened; the
 * totals already count it as nothing earned.
 */
export function sessionReportCsv(report: SessionReport): string {
  const header: CsvCell[] = [
    "Student",
    ...report.items.map((item) => `Q${item.position} ${item.ref}`),
    "Points",
    "Possible",
    "Percent",
  ];
  const rows = report.students.map((student): CsvCell[] => [
    student.displayName,
    ...student.scores.map((score) => (score ? round2(score.points) : null)),
    round2(student.points),
    round2(student.possible),
    student.percent === null ? null : round2(student.percent),
  ]);
  return toCsv([header, ...rows]);
}

const TITLE_LENGTH = 50;

/**
 * A download name made only of lowercase letters, digits and hyphens, so a session title can never
 * break out of the Content-Disposition header it is put in.
 */
export function reportCsvFilename(title: string, closedAt: string | null): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, TITLE_LENGTH)
      .replace(/^-+|-+$/g, "") || "session";
  const day = closedAt?.slice(0, 10);
  const suffix = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : "session-report";
  return `${slug}-${suffix}.csv`;
}
