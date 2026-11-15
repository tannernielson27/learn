/**
 * Addresses and number formats for the after-session report (#186). Pure.
 *
 * The view is kept in the address (`?view=items`) rather than in component state, so a report can
 * be bookmarked or shared on the view it was left on, and switching views needs no script.
 */

export const REPORT_VIEWS = ["students", "items", "steps"] as const;
export type ReportView = (typeof REPORT_VIEWS)[number];

export const SESSIONS_PATH = "/author/sessions";

/**
 * A live session report opens on its questions (#565): "how did the class do on each one" is what
 * a teacher looks at first. That view is the bare address; the others carry `?view=`.
 */
export const LIVE_REPORT_DEFAULT_VIEW: ReportView = "items";

export function reportPath(sessionId: string, view: ReportView = LIVE_REPORT_DEFAULT_VIEW): string {
  const base = `/live/${sessionId}/report`;
  return view === LIVE_REPORT_DEFAULT_VIEW ? base : `${base}?view=${view}`;
}

/**
 * How the students view is drawn (#565): `compact` is a row per student with a mark per question,
 * `grid` the full table of points; sorted by name or by score, highest first.
 */
export interface StudentViewOptions {
  layout: "compact" | "grid";
  sort: "name" | "score";
}

export const DEFAULT_STUDENT_VIEW: StudentViewOptions = { layout: "compact", sort: "name" };

/** Anything unknown is the default; a repeated parameter counts as its first value. */
export function parseStudentViewOptions(params: {
  layout?: string | string[];
  sort?: string | string[];
}): StudentViewOptions {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  return {
    layout: first(params.layout) === "grid" ? "grid" : "compact",
    sort: first(params.sort) === "score" ? "score" : "name",
  };
}

/** The students view's address with these options, defaults left out. */
export function studentsPath(sessionId: string, options: StudentViewOptions): string {
  const params = new URLSearchParams({ view: "students" });
  if (options.layout !== "compact") params.set("layout", options.layout);
  if (options.sort !== "name") params.set("sort", options.sort);
  return `/live/${sessionId}/report?${params.toString()}`;
}

/** The id of a question's row in the questions view, so a link can land on it. */
export const questionAnchor = (position: number): string => `question-${position}`;

export function reportCsvPath(sessionId: string): string {
  return `/live/${sessionId}/report/csv`;
}

/**
 * Anything that is not a known view (a typo, a repeated parameter) is the fallback: the student
 * view unless the report says otherwise (the live report's is its questions, #565).
 */
export function parseReportView(value: unknown, fallback: ReportView = "students"): ReportView {
  return REPORT_VIEWS.find((view) => view === value) ?? fallback;
}

/** An en dash: the table's mark for "nothing to average". */
const NONE = "–";

export function formatPercent(value: number | null): string {
  return value === null ? NONE : `${Math.round(value)}%`;
}

export function formatPoints(value: number | null): string {
  return value === null ? NONE : String(Math.round(value * 100) / 100);
}
