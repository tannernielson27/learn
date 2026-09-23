/**
 * A CSV writer for files an instructor opens in a spreadsheet (#186).
 *
 * Two jobs. Quoting per RFC 4180: a field holding a comma, a double quote, CR or LF is wrapped in
 * double quotes with its own quotes doubled, and every record ends in CRLF. And formula injection:
 * a display name is typed by a student, and a cell that starts with `=`, `+`, `-` or `@` (or a
 * tab or CR, which some spreadsheets skip before looking) is run as a formula when the file is
 * opened. Such a text cell gets a leading single quote, which spreadsheets read as "this is text"
 * (OWASP's CSV injection advice). Numbers are written as numbers: a negative score is data.
 */

export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export function neutraliseFormula(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

export function csvField(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  const safe = neutraliseFormula(cell);
  return NEEDS_QUOTES.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => `${row.map(csvField).join(",")}\r\n`).join("");
}
