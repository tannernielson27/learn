import { totalInputTokens, type Usage } from "../config";
import type { FileRef } from "../files/store";
import type { Client } from "./access";

/**
 * Claiming a chunk before it is sent to Claude (#345), so two tabs, or a tab and a reload, never
 * send the same part twice. `segmentChunk` does not claim; this does, with one conditional update
 * on the status and attempt count read just before (`... where status = <read> and attempts =
 * <read>`): of two requests at once, one changes the row and the other changes nothing.
 *
 * A chunk left `running` by a function that was killed (a timeout, a deploy) can be claimed again
 * once it has not moved for `CHUNK_STALE_MS`, longer than a request may run (`maxDuration`).
 */

/** Longer than the parse route's 300 s `maxDuration`, so a live request is never overtaken. */
export const CHUNK_STALE_MS = 6 * 60 * 1000;
/** Tries per chunk; `ai_import_chunks.attempts` allows 10. */
export const MAX_CHUNK_ATTEMPTS = 5;

export type ChunkClaim =
  | { ok: true; attempts: number }
  | { ok: false; code: "not_found" | "done" | "busy" | "spent" | "unavailable" };

const logged = (step: string, error: { code?: string } | null) => {
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

export async function claimChunk(
  service: Client,
  ref: FileRef,
  position: number,
  now: number = Date.now(),
): Promise<ChunkClaim> {
  const { data: row, error } = await service
    .from("ai_import_chunks")
    .select("id, status, attempts, updated_at")
    .eq("file_id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId)
    .eq("position", position)
    .maybeSingle();
  if (error) {
    logged("reading a chunk", error);
    return { ok: false, code: "unavailable" };
  }
  if (!row) return { ok: false, code: "not_found" };
  if (row.status === "done") return { ok: false, code: "done" };
  const stale = now - Date.parse(row.updated_at) >= CHUNK_STALE_MS;
  if (row.status === "running" && !stale) return { ok: false, code: "busy" };
  if (row.attempts >= MAX_CHUNK_ATTEMPTS) return { ok: false, code: "spent" };

  const { data: claimed, error: claimError } = await service
    .from("ai_import_chunks")
    .update({ status: "running", attempts: row.attempts + 1, last_error: null })
    .eq("id", row.id)
    .eq("org_id", ref.orgId)
    .eq("status", row.status)
    .eq("attempts", row.attempts)
    .select("id");
  if (claimError) {
    logged("claiming a chunk", claimError);
    return { ok: false, code: "unavailable" };
  }
  // Another request changed it between the read and the update: it is that request's now.
  if (!claimed || claimed.length === 0) return { ok: false, code: "busy" };
  return { ok: true, attempts: row.attempts + 1 };
}

type Outcome =
  | { status: "done"; usage: Usage }
  | { status: "failed"; code: string }
  /** Nothing was sent: the try is given back, as if it had not been claimed. */
  | { status: "released" };

/** Records how a claimed try ended. Only the claim that is still current is changed. */
export async function settleChunk(
  service: Client,
  ref: FileRef,
  position: number,
  attempts: number,
  outcome: Outcome,
): Promise<void> {
  const patch =
    outcome.status === "done"
      ? {
          status: "done",
          input_tokens: Math.min(totalInputTokens(outcome.usage), 2_000_000_000),
          output_tokens: Math.min(outcome.usage.outputTokens, 2_000_000_000),
          last_error: null,
        }
      : outcome.status === "failed"
        ? { status: "failed", last_error: outcome.code.slice(0, 500) }
        : { status: "pending", attempts: attempts - 1 };
  const { error } = await service
    .from("ai_import_chunks")
    .update(patch)
    .eq("file_id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId)
    .eq("position", position)
    .eq("status", "running")
    .eq("attempts", attempts);
  if (error) logged("recording a chunk", error);
}
