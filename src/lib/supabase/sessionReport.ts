import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ReportItemInput,
  ReportParticipantInput,
  ReportResponseInput,
  SessionReportInput,
} from "@/lib/live/report";
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

export interface SessionSummary {
  id: string;
  title: string;
  status: SessionStatus;
  openedAt: string;
  closedAt: string | null;
  participantCount: number;
}

export interface SessionReportData {
  session: Omit<SessionSummary, "participantCount">;
  input: SessionReportInput;
}

/** How many sessions the list shows. Cross-session history is out of scope (#186). */
export const RECENT_SESSION_LIMIT = 50;

/** PostgREST's `max_rows` in supabase/config.toml; a longer read is taken a page at a time. */
export const PAGE_SIZE = 1000;

/**
 * The host's recent sessions, newest first, with how many people joined each.
 *
 * The roster is counted here from its ids, not with `participants(count)`: an aggregate embed needs
 * table-wide select on `participants`, which authors do not have (only listed columns, so
 * `rejoin_hash` stays unreadable), and PostgREST refuses aggregate functions on this project.
 */
export async function listRecentSessions(supabase: Client): Promise<SessionSummary[] | null> {
  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, status, opened_at, closed_at, participants(id)")
    .order("opened_at", { ascending: false })
    .limit(RECENT_SESSION_LIMIT);
  if (error || !data) return null;
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    participantCount: row.participants.length,
  }));
}

/**
 * Everything the report is built from, or null when the session is not one this author can see.
 * Throws when a read fails part way, so a half-read session is never shown as a real report.
 */
export async function readSessionReport(
  supabase: Client,
  sessionId: string,
): Promise<SessionReportData | null> {
  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, title, status, opened_at, closed_at, item_set")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`could not read session: ${error.message}`);
  if (!session) return null;

  const itemIds = itemIdsOf(session.item_set);
  const [items, participants, responses] = await Promise.all([
    readItems(supabase, itemIds),
    readParticipants(supabase, sessionId),
    readResponses(supabase, sessionId),
  ]);

  return {
    session: {
      id: session.id,
      title: session.title,
      status: session.status,
      openedAt: session.opened_at,
      closedAt: session.closed_at,
    },
    input: { items: toReportItems(itemIds, items), participants, responses },
  };
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
}

async function readItems(supabase: Client, ids: readonly string[]): Promise<ItemFacts[]> {
  if (ids.length === 0) return [];
  // `content->>id` only: the report needs the item's name and step, never its stem or options.
  const { data, error } = await supabase
    .from("items")
    .select("id, type, cjmm_step, ref:content->>id")
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
