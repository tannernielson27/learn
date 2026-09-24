import { toCsv, type CsvCell } from "@/lib/live/csv";
import { STUDENT_STATUS_LABEL, type AssignmentReport } from "./report";

/** Two decimal places, as a number, so the spreadsheet can still add it up. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The assignment gradebook export (#211), in the session CSV's format (`sessionReportCsv`): one row
 * per student, one column per item from their best attempt, then the totals, then the attempts used
 * and the status. An item the best attempt did not answer is an empty cell, not a zero; a student
 * with nothing submitted has every score cell empty. Escaping and the formula-injection guard are
 * `toCsv`'s.
 *
 * Only a released report (the assignment has closed) can be written: before that there are no
 * scores to put in the file, and the route refuses first.
 */
export function assignmentReportCsv(report: AssignmentReport): string {
  if (!report.released) throw new Error("the report's scores are not released");
  const header: CsvCell[] = [
    "Student",
    ...report.items.map((item) => `Q${item.position} ${item.ref}`),
    "Points",
    "Possible",
    "Percent",
    "Attempts used",
    "Status",
  ];
  const rows = report.students.map((student): CsvCell[] => [
    student.displayName,
    ...student.scores.map((score) => (score ? round2(score.points) : null)),
    student.best ? round2(student.best.score) : null,
    student.best ? round2(student.best.maxScore) : null,
    student.best?.percent == null ? null : round2(student.best.percent),
    student.attemptsUsed,
    STUDENT_STATUS_LABEL[student.status],
  ]);
  return toCsv([header, ...rows]);
}
