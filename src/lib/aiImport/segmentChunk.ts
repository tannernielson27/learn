import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  ClaudeCallError,
  callStructured,
  createClaudeClient,
  type ClaudeFailureCode,
  type MessagesClient,
} from "./claude";
import {
  NO_USAGE,
  SEGMENT_BUDGET_MS,
  SEGMENT_SPLIT_DEPTH,
  SEGMENT_TIMEOUT_MS,
  addUsage,
  aiImportEnabled,
  costOf,
  type AiImportEnv,
  type Usage,
} from "./config";
import { extractPdfPages } from "./files/pdf";
import { chunkPayload, type ChunkPayload } from "./files/prepare";
import type { FileKind } from "./files/sniff";
import { loadCheckedFile, type FileFailure, type FileRef } from "./files/store";
import { estimatePages } from "./files/text";
import { estimateSegmentCost, reserveUsage, settleUsage, type UsageRpc } from "./ledger";
import { takeParseCall, type ParseAllowance } from "./parseLimit";
import {
  SegmentShapeError,
  readSegment,
  segmentRequest,
  type ChunkRef,
  type ChunkSegment,
} from "./segment";
import { joinParts, splitPages, splitText } from "./segmentSplit";
import { storeChunkSegment, type SegmentStore } from "./segmentStore";

/**
 * One chunk through the segment pass (#342): the request #345's browser makes, one chunk at a
 * time. In order, and each step refuses before the next one spends anything:
 *
 * 1. `AI_IMPORT_ENABLED=false` (or no key) refuses before anything else.
 * 2. The teacher's parse calls are counted (`hit_rate_limit`, fails closed).
 * 3. The file is read back through `loadCheckedFile`, which refuses one whose bytes changed.
 * 4. The chunk's cost is reserved under the workspace's cap, from its size alone. A workspace
 *    with AI import off answers `disabled` here (`orgs.ai_import_enabled`, #355).
 * 5. Claude is called, with up to two retries, under that one reservation. Every call of the
 *    request is cut to end inside `SEGMENT_BUDGET_MS`, so the function is not killed mid-call.
 * 6. An answer that ran out of room (`max_tokens`) is not an answer: the chunk is read again as
 *    two halves, at once, each under a reservation of its own with no pages, both reserved
 *    before either is sent, and what they found is joined into the chunk's one segment (#590,
 *    `segmentSplit.ts`). A half that overflows too answers `part_too_large`, which trying again
 *    will not change.
 * 7. Each reservation is settled once with what its own call billed; the chunk's pages are
 *    charged by the first, and only when the chunk parsed.
 * 8. The answer is kept in `ai_import_chunks.segments` for the extract pass (#343). A write that
 *    fails answers `unavailable`, the calls already settled; the chunk is sent again.
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
  /** Writes the chunk's answer to `ai_import_chunks.segments` (#343). */
  storeSegment: SegmentStore;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

export interface SegmentChunkRequest extends FileRef {
  userId: string;
  /** `ai_import_chunks.position`. */
  position: number;
}

type Failure =
  | { ok: false; code: "disabled" | "rate_limited" | "unavailable" | "bad_answer" }
  /** The chunk's answer does not fit even in pieces. Trying again gives the same. */
  | { ok: false; code: "part_too_large" }
  | {
      ok: false;
      code: "cap_reached";
      remainingUsd: number;
      remainingPages: number | null;
      /** The cap was reached after a call of this chunk was billed: the try was used. */
      charged?: true;
    }
  | { ok: false; code: FileFailure["code"] }
  | { ok: false; code: "claude_failed"; reason: ClaudeFailureCode };

export type SegmentChunkResult =
  | {
      ok: true;
      segment: ChunkSegment;
      /** Every call the chunk took, one that overflowed included. */
      usage: Usage;
      costUsd: number;
      attempts: number;
      remainingUsd: number;
      remainingPages: number | null;
    }
  | Failure;

/** What Claude is sent in one call: the whole chunk, or a half of it after an overflow. */
interface Part {
  payload: ChunkPayload;
  /** The chunk's place in the file, with the pages this part holds. */
  ref: ChunkRef;
}

/** How one part was read. `own` is what its own call billed; `total` adds its halves' calls. */
type PartRead = { own: Usage; total: Usage; attempts: number } & (
  { ok: true; segment: ChunkSegment } | { ok: false; failure: Failure }
);

interface Reading {
  deps: SegmentChunkDeps;
  client: MessagesClient;
  kind: FileKind;
  ledger: { orgId: string; batchId: string };
  /** The two halves of a part, or null when it cannot be cut. */
  split: (part: Part) => Promise<[Part, Part] | null>;
  /** When every call of this request must have ended (`SEGMENT_BUDGET_MS`). */
  deadline: number;
}

function partPages({ payload, ref }: Part): number {
  if (ref.pageFrom !== null && ref.pageTo !== null) return ref.pageTo - ref.pageFrom + 1;
  return payload.type === "text" ? estimatePages(payload.text.length) : 1;
}

const refused = (
  reservation: Extract<Awaited<ReturnType<typeof reserveUsage>>, { ok: false }>,
): Failure =>
  reservation.reason === "cap_reached"
    ? {
        ok: false,
        code: "cap_reached",
        remainingUsd: reservation.remainingUsd,
        remainingPages: reservation.remainingPages,
      }
    : { ok: false, code: reservation.reason };

const thrown = (error: unknown) => ({ error: error instanceof Error ? error.name : "unknown" });

/** One call for `part`; when its answer runs out of room, a call for each half. Never throws. */
async function readPart(reading: Reading, part: Part, depth: number): Promise<PartRead> {
  const { deps } = reading;
  let answer: Awaited<ReturnType<typeof callStructured>>;
  try {
    answer = await callStructured(
      reading.client,
      segmentRequest(part.payload, reading.kind, part.ref),
      {
        sleep: deps.sleep,
        random: deps.random,
        now: deps.now,
        deadline: reading.deadline,
        timeoutMs: SEGMENT_TIMEOUT_MS,
      },
    );
  } catch (error) {
    const failure = error instanceof ClaudeCallError ? error : new ClaudeCallError("connection");
    const spent = { own: failure.usage, total: failure.usage, attempts: failure.attempts };
    if (failure.code !== "max_tokens") {
      return {
        ok: false,
        failure: { ok: false, code: "claude_failed", reason: failure.code },
        ...spent,
      };
    }
    return readHalves(reading, part, depth, spent);
  }
  const spent = { own: answer.usage, total: answer.usage, attempts: answer.attempts };
  try {
    return { ok: true, segment: readSegment(answer.value, part.ref, part.payload), ...spent };
  } catch (error) {
    // Not the shape asked for: billed, and no use. Anything else is a fault of ours, and is said.
    if (!(error instanceof SegmentShapeError)) {
      console.error("[ai-import] reading a segment answer failed", thrown(error));
    }
    return { ok: false, failure: { ok: false, code: "bad_answer" }, ...spent };
  }
}

/** Reads the two halves of a part whose own call overflowed, and joins what they found. */
async function readHalves(
  reading: Reading,
  part: Part,
  depth: number,
  spent: { own: Usage; total: Usage; attempts: number },
): Promise<PartRead> {
  const tooLarge: PartRead = {
    ok: false,
    failure: { ok: false, code: "part_too_large" },
    ...spent,
  };
  if (depth >= SEGMENT_SPLIT_DEPTH) return tooLarge;
  let halves: [Part, Part] | null;
  try {
    halves = await reading.split(part);
  } catch {
    halves = null;
  }
  if (!halves) return tooLarge;

  // Both halves are reserved before either is sent, with no pages (the chunk's first reservation
  // holds them): if the cap has room for only one, neither is paid for.
  const { usageRpc } = reading.deps;
  const reserved: string[] = [];
  for (const half of halves) {
    const reservation = await reserveUsage(usageRpc, {
      ...reading.ledger,
      pages: 0,
      costUsd: estimateSegmentCost(half.payload, partPages(half)),
    });
    if (!reservation.ok) {
      await Promise.all(
        reserved.map((id) => settleUsage(usageRpc, id, { pages: 0, usage: NO_USAGE })),
      );
      return { ok: false, failure: refused(reservation), ...spent };
    }
    reserved.push(reservation.reservationId);
  }

  const reads = await Promise.all(
    halves.map(async (half, place) => {
      const read = await readPart(reading, half, depth + 1);
      await settleUsage(usageRpc, reserved[place], { pages: 0, usage: read.own });
      return read;
    }),
  );
  const counted = {
    own: spent.own,
    total: reads.reduce((sum, read) => addUsage(sum, read.total), spent.total),
    attempts: reads.reduce((sum, read) => sum + read.attempts, spent.attempts),
  };
  const segments: ChunkSegment[] = [];
  const failures: Failure[] = [];
  for (const read of reads) {
    if (read.ok) segments.push(read.segment);
    else failures.push(read.failure);
  }
  if (failures.length > 0) {
    // A half that will never fit decides it: trying the chunk again would only pay again.
    const failure = failures.find((f) => f.code === "part_too_large") ?? failures[0];
    return { ok: false, failure, ...counted };
  }
  try {
    return { ok: true, segment: joinParts(part.ref, segments), ...counted };
  } catch (error) {
    console.error("[ai-import] joining a chunk's halves failed", thrown(error));
    return { ok: false, failure: { ok: false, code: "bad_answer" }, ...counted };
  }
}

/** How a part of `bytes` is halved: text near its middle, a PDF by its pages. */
function splitter(bytes: Uint8Array): Reading["split"] {
  return async ({ payload, ref }) => {
    if (payload.type === "text") {
      const halves = splitText(payload.text);
      if (!halves) return null;
      const [first, second] = halves;
      return [
        { payload: { type: "text", text: first }, ref },
        { payload: { type: "text", text: second }, ref },
      ];
    }
    const ranges =
      ref.pageFrom === null || ref.pageTo === null ? null : splitPages(ref.pageFrom, ref.pageTo);
    if (!ranges) return null;
    const half = async ([pageFrom, pageTo]: [number, number]): Promise<Part> => ({
      payload: { type: "pdf", bytes: await extractPdfPages(bytes, pageFrom, pageTo) },
      ref: { ...ref, pageFrom, pageTo },
    });
    return [await half(ranges[0]), await half(ranges[1])];
  };
}

export async function segmentChunk(
  deps: SegmentChunkDeps,
  request: SegmentChunkRequest,
): Promise<SegmentChunkResult> {
  if (!aiImportEnabled(deps.env)) return { ok: false, code: "disabled" };
  const deadline = (deps.now ?? Date.now)() + SEGMENT_BUDGET_MS;

  const allowance = await deps.takeParseCall(request.userId);
  if (allowance !== "ok") return { ok: false, code: allowance };

  const ledger = { orgId: request.orgId, batchId: request.batchId };
  const loaded = await deps.loadFile({ ...ledger, fileId: request.fileId });
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
  const whole: Part = {
    payload,
    ref: {
      position: request.position,
      of: loaded.prepared.chunks.length,
      pageFrom: chunk.pageFrom,
      pageTo: chunk.pageTo,
    },
  };
  const pages = partPages(whole);

  let client: MessagesClient;
  try {
    client = deps.client();
  } catch (error) {
    const reason = error instanceof ClaudeCallError ? error.code : "not_configured";
    return { ok: false, code: "claude_failed", reason };
  }

  const reservation = await reserveUsage(deps.usageRpc, {
    ...ledger,
    pages,
    costUsd: estimateSegmentCost(payload, pages),
  });
  if (!reservation.ok) return refused(reservation);

  const reading: Reading = {
    deps,
    client,
    kind: loaded.prepared.kind,
    ledger,
    split: splitter(loaded.bytes),
    deadline,
  };
  let read: PartRead;
  try {
    read = await readPart(reading, whole, 0);
  } catch (error) {
    // `readPart` does not throw; if it ever does, the reservation is still settled below.
    console.error("[ai-import] reading a chunk failed", thrown(error));
    const failure: Failure = { ok: false, code: "unavailable" };
    read = { ok: false, failure, own: NO_USAGE, total: NO_USAGE, attempts: 0 };
  }
  // The chunk's own call under the chunk's reservation; its pages only when the chunk parsed.
  await settleUsage(deps.usageRpc, reservation.reservationId, {
    pages: read.ok ? pages : 0,
    usage: read.own,
  });
  if (!read.ok) {
    // A refusal that came after a call was billed (the cap, between a chunk and its halves).
    const billed = costOf(read.total) > 0;
    return read.failure.code === "cap_reached" && billed
      ? { ...read.failure, charged: true }
      : read.failure;
  }

  // Kept for the extract pass, which merges every chunk of the file (#343).
  const stored = await deps.storeSegment(
    { ...ledger, fileId: request.fileId },
    request.position,
    read.segment,
  );
  if (stored !== "stored") return { ok: false, code: stored };
  return {
    ok: true,
    segment: read.segment,
    usage: read.total,
    costUsd: costOf(read.total),
    attempts: read.attempts,
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
    storeSegment: storeChunkSegment(service),
  };
}
