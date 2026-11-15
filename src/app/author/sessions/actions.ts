"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/authoring/ids";
import { checkRateLimit } from "@/lib/authoring/rateLimit";
import { requireWriter } from "@/lib/authoring/writer";
import { SESSIONS_PATH } from "@/lib/live/reportFormat";
import {
  HOUSEKEEPING_ERRORS,
  renameSession,
  setSessionsArchived,
  type HousekeepingResult,
} from "@/lib/supabase/sessionHousekeeping";

/** The most sessions one archive or restore may touch: a page and a half of the list. */
const MAX_AT_ONCE = 100;

/**
 * Renames one live session (#565). The database is the check: only the host may, and only the
 * title changes. Counted against the save limit, like any small write.
 */
export async function renameSessionAction(
  sessionId: string,
  title: string,
): Promise<HousekeepingResult> {
  if (!isUuid(sessionId)) return { ok: false, error: HOUSEKEEPING_ERRORS.gone };
  const { supabase } = await requireWriter(SESSIONS_PATH);
  const limit = await checkRateLimit(supabase, "save");
  if (!limit.ok) return { ok: false, error: limit.error };
  const result = await renameSession(supabase, sessionId, typeof title === "string" ? title : "");
  if (result.ok) {
    revalidatePath(SESSIONS_PATH);
    revalidatePath(`/live/${sessionId}/report`);
  }
  return result;
}

/** Archives the signed-in host's ended sessions among `sessionIds` (#565). */
export async function archiveSessionsAction(sessionIds: string[]): Promise<HousekeepingResult> {
  return setArchived(sessionIds, true);
}

/** Puts archived sessions back in the main list (#565); also the archive's Undo. */
export async function restoreSessionsAction(sessionIds: string[]): Promise<HousekeepingResult> {
  return setArchived(sessionIds, false);
}

async function setArchived(sessionIds: unknown, archived: boolean): Promise<HousekeepingResult> {
  const ids = Array.isArray(sessionIds)
    ? [...new Set(sessionIds.filter((id): id is string => typeof id === "string" && isUuid(id)))]
    : [];
  if (ids.length === 0 || ids.length > MAX_AT_ONCE) {
    return { ok: false, error: HOUSEKEEPING_ERRORS.failed };
  }
  const { supabase, userId } = await requireWriter(SESSIONS_PATH);
  const limit = await checkRateLimit(supabase, "save");
  if (!limit.ok) return { ok: false, error: limit.error };
  const result = await setSessionsArchived(supabase, userId, ids, archived);
  if (result.ok) revalidatePath(SESSIONS_PATH);
  return result;
}
