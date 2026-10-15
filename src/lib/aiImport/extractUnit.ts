import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  ClaudeCallError,
  callStructured,
  createClaudeClient,
  type ClaudeFailureCode,
  type MessagesClient,
  type StructuredAnswer,
} from "./claude";
import {
  EXTRACT_MAX_TOKENS,
  MAX_ENTRIES_PER_BATCH,
  NO_USAGE,
  addUsage,
  aiImportEnabled,
  costOf,
  type AiImportEnv,
  type Usage,
} from "./config";
import { planExtraction, type CaseStudyHook } from "./extract";
import { extractQuestions, regionsOf, type UnitCall } from "./extractQuestions";
import { extractPdfPages } from "./files/pdf";
import type { ChunkPayload, PreparedFile } from "./files/prepare";
import { loadCheckedFile, type FileFailure, type FileRef } from "./files/store";
import { estimatePages } from "./files/text";
import { estimateCallCost, reserveUsage, settleUsage, type UsageRpc } from "./ledger";
import { mergeSegments, type MergedQuestion } from "./merge";
import { takeExtractCall, type ParseAllowance } from "./parseLimit";
import { loadFileSegments, type FileSegmentsResult } from "./segmentStore";
import { formatReason, type StagedEntry } from "./stage";

/**
 * One extract unit (#343): the request #345's browser makes once every chunk of a file has its
 * segments, one unit at a time (`units` in each answer says how many there are). In order, and
 * each step refuses before the next one spends anything:
 *
 * 1. `AI_IMPORT_ENABLED=false` (or no key) refuses.
 * 2. The teacher's extract requests are counted (`ai_import_extract`, fails closed).
 * 3. Every chunk's segments are read back and merged; the unit is planned again from them.
 * 4. Questions already staged are skipped (a unit sent twice stages nothing twice), and the batch
 *    stops at 150 entries: the rest are reported as `overLimit`, with no call made for them.
 * 5. The file is read back through `loadCheckedFile` (its hash), and each call is reserved under
 *    the workspace's cap first and settled once after, with no pages: the segment pass counted
 *    them.
 * 6. The entries are inserted; one already there (the same batch and place) is left as it is.
 *
 * The caller has checked that `userId` authors `orgId`, and takes both from the session.
 */

type Client = SupabaseClient<Database>;

/** A file's questions are placed `file order * 1000 + position in the file`. */
export const POSITIONS_PER_FILE = 1000;

export interface StagedRow {
  chunk_id: string | null;
  position: number;
  kind: "item";
  type: string | null;
  status: string;
  reasons: string[];
  source_excerpt: string;
  draft: Json | null;
  item: Json | null;
  group_key: string | null;
  step: number | null;
}

export interface ExtractUnitDeps {
  env?: AiImportEnv;
  /** Built only once every check before the call has passed. */
  client: () => MessagesClient;
  usageRpc: UsageRpc;
  takeExtractCall: (userId: string) => Promise<ParseAllowance>;
  loadSegments: (ref: FileRef) => Promise<FileSegmentsResult>;
  loadFile: (ref: FileRef) => ReturnType<typeof loadCheckedFile>;
  /** The file's place among its batch's files, from 0; null when it is not in the batch. */
  filePlace: (ref: FileRef) => Promise<number | null | "unavailable">;
  /** The places already staged in the batch, and how many entries it has. */
  stagedPlaces: (
    ref: FileRef,
  ) => Promise<{ count: number; positions: Set<number> } | "unavailable">;
  insertEntries: (ref: FileRef, rows: StagedRow[]) => Promise<"ok" | "unavailable">;
  /** #344's case study assembly; without it every question is standalone. */
  caseStudies?: CaseStudyHook;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface ExtractUnitRequest extends FileRef {
  userId: string;
  /** `ExtractUnit.index`, from 0. */
  unit: number;
}

export type ExtractUnitResult =
  | {
      ok: true;
      /** How many units the file has. */
      units: number;
      staged: StagedEntry[];
      /** Questions of this unit that were staged by an earlier request. */
      alreadyStaged: number;
      /** Questions of this unit past the batch's 150 entries, not extracted. */
      overLimit: number;
      usage: Usage;
      costUsd: number;
    }
  | { ok: false; code: "disabled" | "rate_limited" | "unavailable" | "incomplete" }
  | { ok: false; code: "cap_reached"; remainingUsd: number; remainingPages: number | null }
  | { ok: false; code: FileFailure["code"] }
  | { ok: false; code: "claude_failed"; reason: ClaudeFailureCode };

/** A reservation the ledger refused, thrown out of a call. */
class Refused extends Error {
  constructor(readonly result: Extract<ExtractUnitResult, { ok: false }>) {
    super("the reservation was refused");
  }
}

/** What Claude reads for questions read from `chunks`: their text joined, or their pages. */
export async function unitPayload(
  bytes: Uint8Array,
  prepared: PreparedFile,
  chunks: readonly number[],
): Promise<{ payload: ChunkPayload; pages: number }> {
  const parts = prepared.chunks.filter((chunk) => chunks.includes(chunk.position));
  if (parts.length === 0) throw new Error("the unit has no chunk");
  if (parts.every((chunk) => chunk.text !== null)) {
    const text = parts.map((chunk) => chunk.text).join("");
    return { payload: { type: "text", text }, pages: estimatePages(text.length) };
  }
  const from = Math.min(...parts.map((chunk) => chunk.pageFrom ?? Infinity));
  const to = Math.max(...parts.map((chunk) => chunk.pageTo ?? -Infinity));
  return {
    payload: { type: "pdf", bytes: await extractPdfPages(bytes, from, to) },
    pages: to - from + 1,
  };
}

const MAX_DRAFT_CHARS = 200_000;

/** A staged entry as an `ai_import_entries` row. */
export function rowOf(
  entry: StagedEntry,
  base: number,
  chunkIds: ReadonlyMap<number, string>,
): StagedRow {
  const draft =
    entry.draft !== null &&
    entry.draft !== undefined &&
    JSON.stringify(entry.draft).length <= MAX_DRAFT_CHARS
      ? (entry.draft as Json)
      : null;
  return {
    chunk_id: chunkIds.get(entry.chunk) ?? null,
    position: base + entry.position,
    kind: "item",
    type: entry.type,
    status: entry.status,
    reasons: entry.reasons.map(formatReason),
    source_excerpt: entry.sourceExcerpt.slice(0, 20_000),
    draft,
    item: (entry.item as Json | null) ?? null,
    group_key: entry.group ? entry.group.title.slice(0, 80) || null : null,
    step: entry.group?.step ?? null,
  };
}

function wholeText(prepared: PreparedFile): string | null {
  if (prepared.kind === "pdf") return null;
  return prepared.chunks.map((chunk) => chunk.text ?? "").join("");
}

interface Planned {
  units: number;
  questions: MergedQuestion[];
  all: MergedQuestion[];
  call: boolean;
  chunkIds: Map<number, string>;
}

async function plan(
  deps: ExtractUnitDeps,
  ref: FileRef,
  unit: number,
): Promise<Planned | Extract<ExtractUnitResult, { ok: false }>> {
  const loaded = await deps.loadSegments(ref);
  if (!loaded.ok) return { ok: false, code: loaded.code };
  const merged = mergeSegments(loaded.segments).questions;
  const { units } = planExtraction(merged, deps.caseStudies);
  const chosen = units[unit];
  if (!chosen) return { ok: false, code: "not_found" };
  const questions = merged.filter((question) => chosen.positions.includes(question.position));
  return {
    units: units.length,
    questions,
    all: merged,
    call: chosen.call,
    chunkIds: loaded.chunkIds,
  };
}

export async function extractUnit(
  deps: ExtractUnitDeps,
  request: ExtractUnitRequest,
): Promise<ExtractUnitResult> {
  if (!aiImportEnabled(deps.env)) return { ok: false, code: "disabled" };
  const allowance = await deps.takeExtractCall(request.userId);
  if (allowance !== "ok") return { ok: false, code: allowance };

  const ref: FileRef = { orgId: request.orgId, batchId: request.batchId, fileId: request.fileId };
  const planned = await plan(deps, ref, request.unit);
  if ("ok" in planned) return planned;
  const place = await deps.filePlace(ref);
  if (place === "unavailable") return { ok: false, code: "unavailable" };
  if (place === null) return { ok: false, code: "not_found" };
  const base = place * POSITIONS_PER_FILE;
  const staged = await deps.stagedPlaces(ref);
  if (staged === "unavailable") return { ok: false, code: "unavailable" };

  const fresh = planned.questions.filter((q) => !staged.positions.has(base + q.position));
  const room = Math.max(0, MAX_ENTRIES_PER_BATCH - staged.count);
  const questions = fresh.slice(0, room);
  const done = (entries: StagedEntry[], usage: Usage): ExtractUnitResult => ({
    ok: true,
    units: planned.units,
    staged: entries,
    alreadyStaged: planned.questions.length - fresh.length,
    overLimit: fresh.length - questions.length,
    usage,
    costUsd: costOf(usage),
  });
  if (questions.length === 0) return done([], NO_USAGE);

  let entries: StagedEntry[];
  let usage = NO_USAGE;
  if (!planned.call) {
    entries = await extractQuestions(
      () => Promise.reject(new Error("a unit with no NGN type makes no call")),
      questions,
      { payload: { type: "text", text: "" }, kind: "md", sourceText: null },
      new Map(),
    );
  } else {
    const loaded = await deps.loadFile(ref);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    let document: Awaited<ReturnType<typeof unitPayload>>;
    try {
      document = await unitPayload(loaded.bytes, loaded.prepared, questions[0].chunks);
    } catch {
      return { ok: false, code: "unavailable" };
    }
    let client: MessagesClient;
    try {
      client = deps.client();
    } catch (error) {
      const reason = error instanceof ClaudeCallError ? error.code : "not_configured";
      return { ok: false, code: "claude_failed", reason };
    }

    const call: UnitCall = async (body) => {
      const reservation = await reserveUsage(deps.usageRpc, {
        orgId: ref.orgId,
        batchId: ref.batchId,
        pages: 0,
        costUsd: estimateCallCost(
          document.payload,
          document.pages,
          EXTRACT_MAX_TOKENS,
          JSON.stringify(body.content.at(-1) ?? "").length,
        ),
      });
      if (!reservation.ok) {
        throw new Refused(
          reservation.reason === "cap_reached"
            ? {
                ok: false,
                code: "cap_reached",
                remainingUsd: reservation.remainingUsd,
                remainingPages: reservation.remainingPages,
              }
            : { ok: false, code: reservation.reason },
        );
      }
      let answer: StructuredAnswer;
      try {
        answer = await callStructured(client, body, { sleep: deps.sleep, random: deps.random });
      } catch (error) {
        const spent = error instanceof ClaudeCallError ? error.usage : NO_USAGE;
        usage = addUsage(usage, spent);
        await settleUsage(deps.usageRpc, reservation.reservationId, { pages: 0, usage: spent });
        throw error;
      }
      usage = addUsage(usage, answer.usage);
      await settleUsage(deps.usageRpc, reservation.reservationId, {
        pages: 0,
        usage: answer.usage,
      });
      return answer;
    };

    try {
      entries = await extractQuestions(
        call,
        questions,
        {
          payload: document.payload,
          kind: loaded.prepared.kind,
          sourceText: wholeText(loaded.prepared),
        },
        regionsOf(planned.all, wholeText(loaded.prepared)),
      );
    } catch (error) {
      if (error instanceof Refused) return error.result;
      const reason = error instanceof ClaudeCallError ? error.code : "connection";
      return { ok: false, code: "claude_failed", reason };
    }
  }

  const rows = entries.map((entry) => rowOf(entry, base, planned.chunkIds));
  if ((await deps.insertEntries(ref, rows)) !== "ok") return { ok: false, code: "unavailable" };
  return done(entries, usage);
}

const logged = (step: string, error: { code?: string } | null) => {
  // The code and nothing else: never an entry, which holds the document's words and keys.
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

/** The production wiring, on the service-role client. */
export function extractUnitDeps(service: Client): ExtractUnitDeps {
  return {
    client: () => createClaudeClient(),
    // supabase-js types `rpc` per call; the ledger types its two calls itself.
    usageRpc: ((name: "settle_ai_usage", args: never) =>
      service.rpc(name, args)) as unknown as UsageRpc,
    takeExtractCall: (userId) => takeExtractCall(userId),
    loadSegments: (ref) => loadFileSegments(service, ref),
    loadFile: (ref) => loadCheckedFile(service, ref),
    filePlace: async (ref) => {
      const { data, error } = await service
        .from("ai_import_files")
        .select("id")
        .eq("batch_id", ref.batchId)
        .eq("org_id", ref.orgId)
        .order("created_at")
        .order("id");
      if (error) {
        logged("reading a batch's files", error);
        return "unavailable";
      }
      const place = (data ?? []).findIndex((row) => row.id === ref.fileId);
      return place < 0 ? null : place;
    },
    stagedPlaces: async (ref) => {
      const { data, error } = await service
        .from("ai_import_entries")
        .select("position")
        .eq("batch_id", ref.batchId)
        .eq("org_id", ref.orgId);
      if (error) {
        logged("reading a batch's entries", error);
        return "unavailable";
      }
      const positions = new Set((data ?? []).map((row) => row.position));
      return { count: positions.size, positions };
    },
    insertEntries: async (ref, rows) => {
      const { error } = await service.from("ai_import_entries").upsert(
        rows.map((row) => ({ ...row, batch_id: ref.batchId, org_id: ref.orgId })),
        { onConflict: "batch_id,position", ignoreDuplicates: true },
      );
      if (error) {
        logged("staging entries", error);
        return "unavailable";
      }
      return "ok";
    },
  };
}
