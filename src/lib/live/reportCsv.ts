import { toCsv, type CsvCell } from "./csv";
import { questionLabel } from "./questionLabel";
import type { ItemRow, SessionReport } from "./report";

/** Two decimal places, as a number, so the spreadsheet can still add it up. */
const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * The gradebook export (#186): one row per student, one column per item, then the totals. An item
 * the student did not answer is an empty cell, not a zero, so the file says what happened; the
 * totals already count it as nothing earned. After them, each question's text (`questionColumns`).
 */
export function sessionReportCsv(report: SessionReport): string {
  const header: CsvCell[] = [
    "Student",
    ...report.items.map(itemHeader),
    "Points",
    "Possible",
    "Percent",
  ];
  const questions = questionColumns(report.items);
  const rows = report.students.map((student): CsvCell[] => [
    student.displayName,
    ...student.scores.map((score) => (score ? round2(score.points) : null)),
    round2(student.points),
    round2(student.possible),
    student.percent === null ? null : round2(student.percent),
  ]);
  return toCsv(withQuestions([header, ...rows], questions));
}

/**
 * What each question asks, so a teacher can tell the columns apart (#563): one "Q1 question"
 * column per question, holding the start of its text (as the report page shows it), or empty
 * where the text was not read. They come after every older column, so a spreadsheet built on the
 * file's earlier columns and headers reads them where they always were.
 */
export function questionColumns(items: readonly Pick<ItemRow, "position" | "stem">[]): {
  header: CsvCell[];
  cells: CsvCell[];
} {
  return {
    header: items.map((item) => `Q${item.position} question`),
    cells: items.map((item) => questionLabel(item.position, item.stem).excerpt || null),
  };
}

/** The header row and every student's row, each with the question columns on the end. */
export function withQuestions(
  [header, ...rows]: readonly CsvCell[][],
  questions: ReturnType<typeof questionColumns>,
): CsvCell[][] {
  return [
    [...(header ?? []), ...questions.header],
    ...rows.map((row) => [...row, ...questions.cells]),
  ];
}

/**
 * A question's column: its place and its name, and for a step of a case study a quiz played in
 * place (#469), which case study and which step, so the file reads on its own.
 */
export function itemHeader(item: Pick<ItemRow, "position" | "ref" | "caseStudy">): string {
  const name = `Q${item.position} ${item.ref}`;
  const caseStudy = item.caseStudy;
  if (!caseStudy) return name;
  return `${name} (Case study: ${caseStudy.title}, Step ${caseStudy.step} of ${caseStudy.stepCount})`;
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
