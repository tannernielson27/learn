import type { SupabaseClient } from "@supabase/supabase-js";
import { ehrRecordSchema, type EhrRecord } from "@/lib/ngn/schemas";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/**
 * The patient record a case-study session was started with (#184), as the server holds it.
 *
 * `start_session` snapshots the case study's record onto `sessions.patient_record` when the room
 * opens (migration `20260923070000_case_study_live_record.sql`), so this reads the chart the room
 * started with and not whatever the author has done to the case study since. A bank session has
 * none, and this answers null for it.
 *
 * **This is the whole record, and it is never handed to a phone as it is (#335).** An author may
 * hold parts of it back until a later step (`fromStep`, `stepAccess`), so every caller that serves
 * a participant cuts it to the room's step first, with `roomRecord` in
 * `src/lib/liveSupabase/viewEntries.ts`. One column is selected, by name, and it is parsed through
 * `ehrRecordSchema`: stored JSON is external input, and the parse drops any key it does not define.
 *
 * Like `readPublicSessionState`, it is called with the service-role client and must only ever be
 * reached **after** the participant has been resumed against their cookie: it does no checking of
 * its own.
 */
export type SessionRecordRead =
  | { ok: true; record: EhrRecord | null; found: boolean }
  | { ok: false; error: unknown; status: number };

export async function loadSessionRecord(
  client: Client,
  sessionId: string,
): Promise<SessionRecordRead> {
  const { data, error, status } = await client
    .from("sessions")
    .select("patient_record")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) return { ok: false, error, status: status ?? 0 };
  if (!data) return { ok: true, record: null, found: false };
  if (data.patient_record === null || data.patient_record === undefined) {
    return { ok: true, record: null, found: true };
  }
  const parsed = ehrRecordSchema.safeParse(data.patient_record);
  return { ok: true, record: parsed.success ? parsed.data : null, found: true };
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
 * How many sessions' records one server process keeps. A record is a few kilobytes, so this is a
 * few megabytes at most, and a class of rooms running at once is far fewer.
 */
const CACHE_LIMIT = 500;

/**
 * Records already read, by session id, in the order they were read.
 *
 * Safe to keep because the column never changes once the row exists: the trigger writes it on
 * insert, `authenticated` has no grant to update it, and nothing in this app writes it. That is
 * what lets the view route add the record to every phone's view (#335) without a second round
 * trip on every move the host makes (#407): each server process reads a room's record once, a
 * bank room's null as well. A read that failed is not kept, and neither is a session that was not
 * found, so a row that did not exist yet is asked about again.
 */
const cached = new Map<string, EhrRecord | null>();

/** `loadSessionRecord`, remembered for the life of the process. */
export async function readCachedSessionRecord(
  client: Client,
  sessionId: string,
): Promise<SessionRecordRead> {
  if (cached.has(sessionId)) {
    return { ok: true, record: cached.get(sessionId) ?? null, found: true };
  }
  const read = await loadSessionRecord(client, sessionId);
  if (read.ok && read.found) {
    if (cached.size >= CACHE_LIMIT) {
      const oldest = cached.keys().next().value;
      if (oldest !== undefined) cached.delete(oldest);
    }
    cached.set(sessionId, read.record);
  }
  return read;
}

/** Forgets every record read. For the tests, which share this module. */
export function forgetSessionRecords(): void {
  cached.clear();
}
