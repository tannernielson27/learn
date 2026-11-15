import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCaseStudyRuns } from "@/lib/live/caseStudyRuns";
import {
  inCaseStudies,
  type ReportItemInput,
  type ReportParticipantInput,
  type ReportResponseInput,
  type SessionReportInput,
} from "@/lib/live/report";
import { titlePattern, type SessionStatusFilter } from "@/lib/live/sessionFilters";
import type { CjmmStep } from "@/lib/ngn/types";
import type { Database } from "./database.types";
import type { SessionStatus } from "./sessions";

type Client = SupabaseClient<Database>;

/**
 * The reads behind the after-session report (#186). Every one runs as the signed-in author, so
 * row level security is the access check: `sessions`, `session_responses`, `participants` and
 * `items` each let an author read only their own org's rows, and a session in another org reads
 * exactly like one that does not exist. Nothing here filters by org itself, on purpose: a second
 * check in TypeScript would be a second place for the rule to drift.
 *
 * Display names are the only identity read. `participants.profile_id` is not selected.
 */

/** What a row of a session list shows (the Live sessions page, a class's sessions tab). */
export interface SessionListRow {
  id: string;
  title: string;
  status: SessionStatus;
  openedAt: string;
  closedAt: string | null;
  participantCount: number;
}

/** A row of the Live sessions page, which can also be renamed and archived (#565). */
export interface SessionSummary extends SessionListRow {
  /** Who ran it: only they may rename or archive it (#565). */
  hostId: string;
  /** When it was archived (#565), or null. */
  archivedAt: string | null;
}

export interface SessionReportData {
  session: Omit<SessionSummary, "participantCount" | "archivedAt">;
  /**
   * What the report is built from; null until the session has ended, when there is no report yet
   * and nothing past the session row is read (perf-audit #17).
   */
  input: SessionReportInput | null;
}

/** How many sessions the list shows. Cross-session history is out of scope (#186). */
export const RECENT_SESSION_LIMIT = 50;

/** What the Live sessions list narrows by (#565); `sessionFilters.ts` reads them from the URL. */
export interface ListSessionsOptions {
  /** Words to find in the title; "" for none. */
  q?: string;
  status?: SessionStatusFilter;
  /** Only this host's sessions; null for everyone's in the org. */
  hostId?: string | null;
  limit?: number;
}

/** PostgREST's `max_rows` in supabase/config.toml; a longer read is taken a page at a time. */
export const PAGE_SIZE = 1000;

/**
 * The host's recent sessions, newest first, with how many people joined each.
 *
 * The roster is counted here from its ids, not with `participants(count)`: an aggregate embed needs
 * table-wide select on `participants`, which authors do not have (only listed columns, so
 * `rejoin_hash` stays unreadable), and PostgREST refuses aggregate functions on this project.
 */
export async function listRecentSessions(
  supabase: Client,
  options: ListSessionsOptions = {},
): Promise<SessionSummary[] | null> {
  const { q = "", status = "all", hostId = null, limit = RECENT_SESSION_LIMIT } = options;
  let query = supabase
    .from("sessions")
    .select("id, title, status, opened_at, closed_at, host_id, archived_at, participants(id)");
  if (q !== "") query = query.ilike("title", titlePattern(q));
  if (status === "ended") query = query.eq("status", "ended");
  if (status === "open") query = query.neq("status", "ended");
  // #565: archived sessions have a view of their own and are left out of every other.
  query =
    status === "archived" ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  // Narrows what row level security already allows; it is never the access check.
  if (hostId !== null) query = query.eq("host_id", hostId);
  const { data, error } = await query
    .order("opened_at", { ascending: false })
    // Ties broken by id, so a "Show more" never shows a row twice or skips one.
    .order("id", { ascending: false })
    .limit(limit);
  if (error || !data) return null;
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    participantCount: row.participants.length,
    hostId: row.host_id,
    archivedAt: row.archived_at,
  }));
}

/**
 * Everything the report is built from, or null when the session is not one this author can see.
 * A session that has not ended comes back with its header and no input.
 * Throws when a read fails part way, so a half-read session is never shown as a real report.
 */
export async function readSessionReport(
  supabase: Client,
  sessionId: string,
): Promise<SessionReportData | null> {
  const session = await readSessionRow(supabase, sessionId);
  if (!session) return null;
  const header = {
    id: session.id,
    title: session.title,
    status: session.status,
    openedAt: session.opened_at,
    closedAt: session.closed_at,
    hostId: session.host_id,
  };
  // Every caller answers "not yet" for a session that has not ended, so its rows are not read.
  if (session.status !== "ended") return { session: header, input: null };

  const itemIds = itemIdsOf(session.item_set);
  const [items, participants, responses] = await Promise.all([
    readItems(supabase, itemIds),
    readParticipants(supabase, sessionId),
    readResponses(supabase, sessionId),
  ]);

  return {
    session: header,
    input: {
      // #469: each step of a case study a whole quiz played in place, under its case study.
      items: inCaseStudies(toReportItems(itemIds, items), placesOf(session.case_study_records)),
      participants,
      responses,
    },
  };
}

/** PostgreSQL's undefined_column, which PostgREST passes through for a column it cannot select. */
const UNDEFINED_COLUMN = "42703";

/**
 * The session's own row. A database the #469 migration has not reached has no
 * `case_study_records`; there, no session played a case study in place, and it reads as none.
 */
async function readSessionRow(supabase: Client, sessionId: string) {
  const read = await supabase
    .from("sessions")
    .select("id, title, status, opened_at, closed_at, host_id, item_set, case_study_records")
    .eq("id", sessionId)
    .maybeSingle();
  if (read.error?.code === UNDEFINED_COLUMN) {
    const { data, error } = await supabase
      .from("sessions")
      .select("id, title, status, opened_at, closed_at, host_id, item_set")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw new Error(`could not read session: ${error.message}`);
    return data === null ? null : { ...data, case_study_records: null };
  }
  if (read.error) throw new Error(`could not read session: ${read.error.message}`);
  return read.data;
}

/** Where each case study a session played in place sits in its set, as the session snapshotted it. */
function placesOf(stored: unknown) {
  return parseCaseStudyRuns(stored).map(({ caseStudyId, title, firstPosition, stepCount }) => ({
    caseStudyId,
    title,
    firstPosition,
    stepCount,
  }));
}

/**
 * A set of items as a report lists them, in the set's order: each one's name and step, and never
 * its stem, options or key. The assignment report (#211) reads its items through this too. Throws
 * when the read fails.
 */
export async function readReportItems(
  supabase: Client,
  ids: readonly string[],
): Promise<ReportItemInput[]> {
  return toReportItems(ids, await readItems(supabase, ids));
}

/** `item_set` is a JSON array of item ids, written only by `start_session`; checked anyway. */
function itemIdsOf(itemSet: unknown): string[] {
  return Array.isArray(itemSet) ? itemSet.filter((id): id is string => typeof id === "string") : [];
}

interface ItemFacts {
  id: string;
  type: string;
  cjmm_step: number | null;
  ref: string | null;
  stem: string | null;
}

async function readItems(supabase: Client, ids: readonly string[]): Promise<ItemFacts[]> {
  if (ids.length === 0) return [];
  // The item's name, step and question text (#563: the report names each question by its stem),
  // never its options, key or rationale. Read with the author's own client on teacher-only pages.
  const { data, error } = await supabase
    .from("items")
    .select("id, type, cjmm_step, ref:content->>id, stem:content->stem->>value")
    .in("id", [...new Set(ids)]);
  if (error || !data) throw new Error(`could not read items: ${error?.message ?? "no data"}`);
  return data as ItemFacts[];
}

const isCjmmStep = (value: number | null): value is CjmmStep =>
  value !== null && Number.isInteger(value) && value >= 1 && value <= 6;

/** Every position in the session, including an item the author could no longer read. */
function toReportItems(ids: readonly string[], facts: readonly ItemFacts[]): ReportItemInput[] {
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  return ids.map((id, index) => {
    const fact = byId.get(id);
    return {
      position: index + 1,
      itemId: id,
      ref: fact?.ref ?? id,
      stem: fact?.stem ?? null,
      type: fact?.type ?? null,
      cjmmStep: fact && isCjmmStep(fact.cjmm_step) ? fact.cjmm_step : null,
    };
  });
}

async function readParticipants(
  supabase: Client,
  sessionId: string,
): Promise<ReportParticipantInput[]> {
  const rows = await readAllPages(
    (from, to) =>
      supabase
        .from("participants")
        .select("id, display_name, joined_at")
        .eq("session_id", sessionId)
        .order("id")
        .range(from, to),
    "participants",
  );
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name,
    joinedAt: row.joined_at,
  }));
}

async function readResponses(supabase: Client, sessionId: string): Promise<ReportResponseInput[]> {
  const rows = await readAllPages(
    (from, to) =>
      supabase
        .from("session_responses")
        .select("participant_id, item_position, points, max_points")
        .eq("session_id", sessionId)
        .order("id")
        .range(from, to),
    "responses",
  );
  return rows.map((row) => ({
    participantId: row.participant_id,
    itemPosition: row.item_position,
    // numeric(8, 2): a number over PostgREST, but a string is what a driver may hand back.
    points: Number(row.points),
    maxPoints: Number(row.max_points),
  }));
}

type Page<Row> = PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;

/** Reads page after page until one comes back short. A session has at most 300 participants. */
export async function readAllPages<Row>(
  page: (from: number, to: number) => Page<Row>,
  what: string,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error || !data) throw new Error(`could not read ${what}: ${error?.message ?? "no data"}`);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}
