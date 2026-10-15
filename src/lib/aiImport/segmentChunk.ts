import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  ClaudeCallError,
  callStructured,
  createClaudeClient,
  type ClaudeFailureCode,
  type MessagesClient,
} from "./claude";
import { NO_USAGE, aiImportEnabled, costOf, type AiImportEnv, type Usage } from "./config";
import { chunkPayload, type ChunkPayload, type PreparedChunk } from "./files/prepare";
import { loadCheckedFile, type FileFailure, type FileRef } from "./files/store";
import { estimatePages } from "./files/text";
import { estimateSegmentCost, reserveUsage, settleUsage, type UsageRpc } from "./ledger";
import { takeParseCall, type ParseAllowance } from "./parseLimit";
import { SegmentShapeError, readSegment, segmentRequest, type ChunkSegment } from "./segment";

/**
 * One chunk through the segment pass (#342): the request #345's browser makes, one chunk at a
 * time. In order, and each step refuses before the next one spends anything:
 *
 * 1. `AI_IMPORT_ENABLED=false` (or no key) refuses before anything else.
 * 2. The teacher's parse calls are counted (`hit_rate_limit`, fails closed).
 * 3. The file is read back through `loadCheckedFile`, which refuses one whose bytes changed.
 * 4. The chunk's cost is reserved under the workspace's cap, from its size alone. A workspace
 *    with AI import off answers `disabled` here (`orgs.ai_import_enabled`, #355).
 * 5. Claude is called, with up to two retries, under that one reservation.
 * 6. The reservation is settled once: the real tokens, and the pages only when the chunk parsed.
 *
 * The caller has checked that `userId` authors `orgId`, and takes both from the session.
 */

export interface SegmentChunkDeps {
  env?: AiImportEnv;
  /** Built only once every check before the call has passed. */
  client: () => MessagesClient;
  usageRpc: UsageRpc;
  takeParseCall: (userId: string) => Promise<ParseAllowance>;
  loadFile: (ref: FileRef) => ReturnType<typeof loadCheckedFile>;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface SegmentChunkRequest extends FileRef {
  userId: string;
  /** `ai_import_chunks.position`. */
  position: number;
}

export type SegmentChunkResult =
  | {
      ok: true;
      segment: ChunkSegment;
      usage: Usage;
      costUsd: number;
      attempts: number;
      remainingUsd: number;
      remainingPages: number | null;
    }
  | { ok: false; code: "disabled" | "rate_limited" | "unavailable" | "bad_answer" }
  | { ok: false; code: "cap_reached"; remainingUsd: number; remainingPages: number | null }
  | { ok: false; code: FileFailure["code"] }
  | { ok: false; code: "claude_failed"; reason: ClaudeFailureCode };

function chunkPages(chunk: PreparedChunk, payload: ChunkPayload): number {
  if (chunk.pageFrom !== null && chunk.pageTo !== null) return chunk.pageTo - chunk.pageFrom + 1;
  return payload.type === "text" ? estimatePages(payload.text.length) : 1;
}

export async function segmentChunk(
  deps: SegmentChunkDeps,
  request: SegmentChunkRequest,
): Promise<SegmentChunkResult> {
  if (!aiImportEnabled(deps.env)) return { ok: false, code: "disabled" };

  const allowance = await deps.takeParseCall(request.userId);
  if (allowance !== "ok") return { ok: false, code: allowance };

  const loaded = await deps.loadFile({
    orgId: request.orgId,
    batchId: request.batchId,
    fileId: request.fileId,
  });
  if (!loaded.ok) return { ok: false, code: loaded.code };
  const chunk = loaded.prepared.chunks.find((c) => c.position === request.position);
  if (!chunk) return { ok: false, code: "not_found" };
  let payload: ChunkPayload;
  try {
    payload = await chunkPayload(loaded.bytes, loaded.prepared, request.position);
  } catch {
    // The same bytes cut the same way when they were checked; a failure now is not the file's.
    return { ok: false, code: "unavailable" };
  }
  const pages = chunkPages(chunk, payload);

  let client: MessagesClient;
  try {
    client = deps.client();
  } catch (error) {
    const reason = error instanceof ClaudeCallError ? error.code : "not_configured";
    return { ok: false, code: "claude_failed", reason };
  }

  const reservation = await reserveUsage(deps.usageRpc, {
    orgId: request.orgId,
    batchId: request.batchId,
    pages,
    costUsd: estimateSegmentCost(payload, pages),
  });
  if (!reservation.ok) {
    if (reservation.reason === "cap_reached") {
      const { remainingUsd, remainingPages } = reservation;
      return { ok: false, code: "cap_reached", remainingUsd, remainingPages };
    }
    return { ok: false, code: reservation.reason };
  }

  const chunkRef = {
    position: request.position,
    of: loaded.prepared.chunks.length,
    pageFrom: chunk.pageFrom,
    pageTo: chunk.pageTo,
  };
  const settle = (settledPages: number, usage: Usage) =>
    settleUsage(deps.usageRpc, reservation.reservationId, { pages: settledPages, usage });

  let answer: Awaited<ReturnType<typeof callStructured>>;
  try {
    answer = await callStructured(client, segmentRequest(payload, loaded.prepared.kind, chunkRef), {
      sleep: deps.sleep,
      random: deps.random,
    });
  } catch (error) {
    const failure = error instanceof ClaudeCallError ? error : new ClaudeCallError("connection");
    await settle(0, failure.usage ?? NO_USAGE);
    return { ok: false, code: "claude_failed", reason: failure.code };
  }

  let segment: ChunkSegment;
  try {
    segment = readSegment(answer.value, chunkRef, payload);
  } catch (error) {
    if (!(error instanceof SegmentShapeError)) throw error;
    await settle(0, answer.usage);
    return { ok: false, code: "bad_answer" };
  }

  await settle(pages, answer.usage);
  return {
    ok: true,
    segment,
    usage: answer.usage,
    costUsd: costOf(answer.usage),
    attempts: answer.attempts,
    remainingUsd: reservation.remainingUsd,
    remainingPages: reservation.remainingPages,
  };
}

/** The production wiring, on the service-role client. */
export function segmentChunkDeps(service: SupabaseClient<Database>): SegmentChunkDeps {
  return {
    client: () => createClaudeClient(),
    // supabase-js types `rpc` per call; the ledger types its two calls itself.
    usageRpc: ((name: "settle_ai_usage", args: never) =>
      service.rpc(name, args)) as unknown as UsageRpc,
    takeParseCall: (userId) => takeParseCall(userId),
    loadFile: (ref) => loadCheckedFile(service, ref),
  };
}
