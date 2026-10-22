import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCaseStudyRuns, type CaseStudyRun } from "@/lib/live/caseStudyRuns";
import { ehrRecordSchema, type EhrRecord } from "@/lib/ngn/schemas";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/**
 * Everything a room's charts are cut from (#469): the one record of a session run from a case
 * study, or, for a session run from a quiz, each case study it plays in place with its own record
 * (`sessions.case_study_records`). At most one of the two is ever set; a quiz of loose questions
 * has neither.
 */
export interface SessionRecords {
  record: EhrRecord | null;
  runs: CaseStudyRun[];
}

/**
 * The patient record a case-study session was started with (#184), and the records of the case
 * studies a whole-quiz session plays in place (#469), as the server holds them.
 *
 * `start_session` snapshots the case study's record onto `sessions.patient_record` when the room
 * opens (migration `20260923070000_case_study_live_record.sql`), so this reads the chart the room
 * started with and not whatever the author has done to the case study since. A bank session has
 * none, and this answers null for it.
 *
 * **This is the whole record, and it is never handed to a phone as it is (#335).** An author may
 * hold parts of it back until a later step (`fromStep`, `stepAccess`), so every caller that serves
 * a participant cuts it to the room's step first, with `roomRecord` in
 * `src/lib/liveSupabase/viewEntries.ts`. Two columns are selected, by name, and every record in them
 * is parsed through `ehrRecordSchema`: stored JSON is external input, and the parse drops any key
 * it does not define.
 *
 * Like `readPublicSessionState`, it is called with the service-role client and must only ever be
 * reached **after** the participant has been resumed against their cookie: it does no checking of
 * its own.
 */
export type SessionRecordRead =
  ({ ok: true; found: boolean } & SessionRecords) | { ok: false; error: unknown; status: number };

/** PostgreSQL's undefined_column, which PostgREST passes through for a column it cannot select. */
const UNDEFINED_COLUMN = "42703";

export async function loadSessionRecord(
  client: Client,
  sessionId: string,
): Promise<SessionRecordRead> {
  const read = await client
    .from("sessions")
    .select("patient_record, case_study_records")
    .eq("id", sessionId)
    .maybeSingle();
  // The app may reach a database the #469 migration has not reached yet: there, no session plays
  // a case study in place, and the one record is all there is to read.
  if (read.error?.code === UNDEFINED_COLUMN) {
    const { data, error, status } = await client
      .from("sessions")
      .select("patient_record")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) return { ok: false, error, status: status ?? 0 };
    return recordsOf(data === null ? null : { ...data, case_study_records: null });
  }
  const { data, error, status } = read;
  if (error) return { ok: false, error, status: status ?? 0 };
  return recordsOf(data);
}

function recordsOf(
  row: { patient_record: unknown; case_study_records: unknown } | null,
): SessionRecordRead {
  if (!row) return { ok: true, record: null, runs: [], found: false };
  const runs = parseCaseStudyRuns(row.case_study_records);
  if (row.patient_record === null || row.patient_record === undefined) {
    return { ok: true, record: null, runs, found: true };
  }
  const parsed = ehrRecordSchema.safeParse(row.patient_record);
  return { ok: true, record: parsed.success ? parsed.data : null, runs, found: true };
}

/** The record, or null for a bank session, a missing session and a read that failed alike. */
export async function readSessionRecord(
  client: Client,
  sessionId: string,
): Promise<EhrRecord | null> {
  const read = await readCachedSessionRecord(client, sessionId);
  return read.ok ? read.record : null;
}

/**
 * The one record and every case study's (#469), or neither for a quiz of loose questions, a
 * missing session and a read that failed alike. Whole: see the note above on who may be handed it.
 */
export async function readSessionRecords(
  client: Client,
  sessionId: string,
): Promise<SessionRecords> {
  const read = await readCachedSessionRecord(client, sessionId);
  return read.ok ? { record: read.record, runs: read.runs } : { record: null, runs: [] };
}

/**
 * How many sessions' records one server process keeps. A record is a few kilobytes, so this is a
 * few megabytes at most, and a class of rooms running at once is far fewer.
 */
const CACHE_LIMIT = 500;

/**
 * Records already read, by session id, in the order they were read.
 *
 * Safe to keep because the columns never change once the row exists: the trigger writes them on
 * insert, `authenticated` has no grant to update it, and nothing in this app writes it. That is
 * what lets the view route add the record to every phone's view (#335) without a second round
 * trip on every move the host makes (#407): each server process reads a room's record once, a
 * bank room's null as well. A read that failed is not kept, and neither is a session that was not
 * found, so a row that did not exist yet is asked about again.
 */
const cached = new Map<string, SessionRecords>();

/** `loadSessionRecord`, remembered for the life of the process. */
export async function readCachedSessionRecord(
  client: Client,
  sessionId: string,
): Promise<SessionRecordRead> {
  const held = cached.get(sessionId);
  if (held !== undefined) return { ok: true, ...held, found: true };
  const read = await loadSessionRecord(client, sessionId);
  if (read.ok && read.found) {
    if (cached.size >= CACHE_LIMIT) {
      const oldest = cached.keys().next().value;
      if (oldest !== undefined) cached.delete(oldest);
    }
    cached.set(sessionId, { record: read.record, runs: read.runs });
  }
  return read;
}

/** Forgets every record read. For the tests, which share this module. */
export function forgetSessionRecords(): void {
  cached.clear();
}
