import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/**
 * A teacher tidying up their live sessions (#565): renaming one, and archiving or restoring ended
 * ones. Every write runs as the signed-in author. The database decides: the column grants allow
 * only `title` and `archived_at`, and `private.guard_session_change` lets them change only on the
 * host's own session, archiving only once it has ended (20261114000000_session_archive.sql).
 * The host filter below just keeps a mixed selection from failing as a whole.
 */

/** The longest title the table accepts (`sessions.title` checks 1 to 200 characters). */
export const SESSION_TITLE_MAX = 200;

export const HOUSEKEEPING_ERRORS = {
  emptyTitle: "Give the live session a name.",
  longTitle: `Keep the name to ${SESSION_TITLE_MAX} characters or fewer.`,
  notYours: "Only the teacher who ran a live session can rename or archive it.",
  gone: "That live session no longer exists.",
  failed: "That did not save. Try again.",
} as const;

export type HousekeepingResult = { ok: true; count: number } | { ok: false; error: string };

/** A title as it will be saved, or why it cannot be. */
export function checkSessionTitle(
  raw: string,
): { ok: true; title: string } | { ok: false; error: string } {
  const title = raw.trim().replace(/\s+/g, " ");
  if (title.length === 0) return { ok: false, error: HOUSEKEEPING_ERRORS.emptyTitle };
  if (title.length > SESSION_TITLE_MAX) return { ok: false, error: HOUSEKEEPING_ERRORS.longTitle };
  return { ok: true, title };
}

const refusal = (code: string | undefined): string =>
  code === "42501" ? HOUSEKEEPING_ERRORS.notYours : HOUSEKEEPING_ERRORS.failed;

export async function renameSession(
  supabase: Client,
  sessionId: string,
  rawTitle: string,
): Promise<HousekeepingResult> {
  const checked = checkSessionTitle(rawTitle);
  if (!checked.ok) return checked;
  const { data, error } = await supabase
    .from("sessions")
    .update({ title: checked.title })
    .eq("id", sessionId)
    .select("id");
  if (error) return { ok: false, error: refusal(error.code) };
  if (!data || data.length === 0) return { ok: false, error: HOUSEKEEPING_ERRORS.gone };
  return { ok: true, count: data.length };
}

/**
 * Archives (or restores) those of `sessionIds` that this host ran and that have ended. The time
 * sent is replaced by the server's. Answers how many changed, which may be fewer than asked.
 */
export async function setSessionsArchived(
  supabase: Client,
  hostId: string,
  sessionIds: readonly string[],
  archived: boolean,
): Promise<HousekeepingResult> {
  if (sessionIds.length === 0) return { ok: true, count: 0 };
  const { data, error } = await supabase
    .from("sessions")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .in("id", [...sessionIds])
    .eq("host_id", hostId)
    .eq("status", "ended")
    .select("id");
  if (error) return { ok: false, error: refusal(error.code) };
  return { ok: true, count: data?.length ?? 0 };
}
