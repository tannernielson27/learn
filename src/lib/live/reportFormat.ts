/**
 * Addresses and number formats for the after-session report (#186). Pure.
 *
 * The view is kept in the address (`?view=items`) rather than in component state, so a report can
 * be bookmarked or shared on the view it was left on, and switching views needs no script.
 */

export const REPORT_VIEWS = ["students", "items", "steps"] as const;
export type ReportView = (typeof REPORT_VIEWS)[number];

export const SESSIONS_PATH = "/author/sessions";

export function reportPath(sessionId: string, view: ReportView = "students"): string {
  const base = `/live/${sessionId}/report`;
  return view === "students" ? base : `${base}?view=${view}`;
}

export function reportCsvPath(sessionId: string): string {
  return `/live/${sessionId}/report/csv`;
}

/** Anything that is not a known view (a typo, a repeated parameter) is the student view. */
export function parseReportView(value: unknown): ReportView {
  return REPORT_VIEWS.find((view) => view === value) ?? "students";
}

/** An en dash: the table's mark for "nothing to average". */
const NONE = "–";

export function formatPercent(value: number | null): string {
  return value === null ? NONE : `${Math.round(value)}%`;
}

export function formatPoints(value: number | null): string {
  return value === null ? NONE : String(Math.round(value * 100) / 100);
}
