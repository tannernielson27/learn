import type { SupabaseClient } from "@supabase/supabase-js";
import { ehrRecordSchema, type EhrRecord } from "@/lib/ngn/schemas";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/**
 * The patient record a case-study session was started with, for a participant's phone (#184).
 *
 * `start_session` snapshots the case study's record onto `sessions.patient_record` when the room
 * opens (migration `20260923050000_case_study_live_record.sql`), so this reads the chart the room
 * started with and not whatever the author has done to the case study since. A bank session has
 * none, and this answers null for it.
 *
 * **Why this is safe to hand a student.** A record is not answer-bearing — the keys, rationales
 * and scoring of the six steps live on `public.items`, and `ITEM_FIELD_VISIBILITY` in
 * `src/lib/ngn/submit.ts` classes `ehr` as student-safe. One column is selected, by name, and it
 * is parsed through `ehrRecordSchema` before it leaves: stored JSON is external input, and the
 * schema's parse drops any key it does not define, so nothing that happened to be written beside
 * the record is passed through.
 *
 * Like `readPublicSessionState`, it is called with the service-role client and must only ever be
 * reached **after** the participant has been resumed against their cookie: it does no checking of
 * its own.
 */
export async function readSessionRecord(
  client: Client,
  sessionId: string,
): Promise<EhrRecord | null> {
  const { data, error } = await client
    .from("sessions")
    .select("patient_record")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !data || data.patient_record === null) return null;
  const parsed = ehrRecordSchema.safeParse(data.patient_record);
  return parsed.success ? parsed.data : null;
}
