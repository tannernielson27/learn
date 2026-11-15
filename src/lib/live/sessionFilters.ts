/**
 * The Live sessions list's search, filters and length (#565), kept in the address so a filtered
 * list survives a reload, the back button and a shared link, and so filtering needs no script.
 * Pure: no React, Next or Supabase.
 *
 *   /author/sessions?q=cardiac&status=ended&who=mine&show=100
 *
 * A value left at its default is left out of the address.
 */
import { SESSIONS_PATH } from "./reportFormat";

export const SESSION_STATUS_FILTERS = ["all", "ended", "open"] as const;
export type SessionStatusFilter = (typeof SESSION_STATUS_FILTERS)[number];

export const SESSION_WHO_FILTERS = ["all", "mine"] as const;
export type SessionWhoFilter = (typeof SESSION_WHO_FILTERS)[number];

/** How many rows the list shows first, and how many more each "Show more" adds. */
export const SESSION_PAGE = 50;
/** The most one address may ask for, so `?show=` cannot be turned into a table dump. */
export const SESSION_SHOW_MAX = 500;
/** The longest search kept; the title itself is at most 200 characters. */
export const SESSION_QUERY_MAX = 100;

export interface SessionFilters {
  /** Words to find in the title, trimmed; "" for none. */
  q: string;
  status: SessionStatusFilter;
  who: SessionWhoFilter;
  /** How many rows to show, a whole number of pages between one page and the cap. */
  show: number;
}

export const DEFAULT_SESSION_FILTERS: SessionFilters = {
  q: "",
  status: "all",
  who: "all",
  show: SESSION_PAGE,
};

type Param = string | string[] | undefined;

/** A repeated parameter (`?q=a&q=b`) counts as its first value. */
const first = (value: Param): string | undefined => (Array.isArray(value) ? value[0] : value);

const oneOf = <T extends string>(options: readonly T[], value: Param, fallback: T): T =>
  options.find((option) => option === first(value)) ?? fallback;

function parseShow(value: Param): number {
  const n = Number.parseInt(first(value) ?? "", 10);
  if (!Number.isFinite(n) || n <= SESSION_PAGE) return SESSION_PAGE;
  // Rounded up to a whole page, so every "Show more" lands on the same row counts.
  return Math.min(SESSION_SHOW_MAX, Math.ceil(n / SESSION_PAGE) * SESSION_PAGE);
}

/** Anything unknown or malformed falls back to its default rather than failing the page. */
export function parseSessionFilters(params: Record<string, Param>): SessionFilters {
  return {
    q: (first(params.q) ?? "").trim().slice(0, SESSION_QUERY_MAX),
    status: oneOf(SESSION_STATUS_FILTERS, params.status, "all"),
    who: oneOf(SESSION_WHO_FILTERS, params.who, "all"),
    show: parseShow(params.show),
  };
}

/** Whether anything narrows the list; the length alone does not. */
export const isFiltered = (filters: SessionFilters): boolean =>
  filters.q !== "" || filters.status !== "all" || filters.who !== "all";

/** The list's address for these filters, defaults left out. */
export function sessionsHref(filters: Partial<SessionFilters> = {}): string {
  const merged = { ...DEFAULT_SESSION_FILTERS, ...filters };
  const params = new URLSearchParams();
  if (merged.q !== "") params.set("q", merged.q);
  if (merged.status !== "all") params.set("status", merged.status);
  if (merged.who !== "all") params.set("who", merged.who);
  if (merged.show > SESSION_PAGE) params.set("show", String(merged.show));
  const query = params.toString();
  return query === "" ? SESSIONS_PATH : `${SESSIONS_PATH}?${query}`;
}

/**
 * The search as a SQL `ilike` pattern: `%`, `_` and `\` in what was typed match themselves, so
 * "100%" finds "100%" and not everything that starts with "100".
 */
export const titlePattern = (q: string): string => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

export interface DatedSession {
  openedAt: string;
}

export interface SessionGroup<T extends DatedSession> {
  label: string;
  sessions: T[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
// UTC, like `formatSessionDate`, so a row and the group it sits in never disagree about its day.
const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * Newest-first sessions in date groups: "This week" for the last seven days, "Earlier this
 * month", then one group per month ("October 2026"). The order inside each group is kept.
 */
export function groupSessionsByDate<T extends DatedSession>(
  sessions: readonly T[],
  now: Date,
): SessionGroup<T>[] {
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const thisMonth = MONTH.format(now);
  const groups: SessionGroup<T>[] = [];
  for (const session of sessions) {
    const opened = new Date(session.openedAt);
    const month = MONTH.format(opened);
    const label =
      opened.getTime() >= weekAgo
        ? "This week"
        : month === thisMonth
          ? "Earlier this month"
          : month;
    const last = groups.at(-1);
    if (last?.label === label) last.sessions.push(session);
    else groups.push({ label, sessions: [session] });
  }
  return groups;
}
