import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { MessagesClient } from "@/lib/aiImport/claude";
import { extractUnit, type ExtractUnitDeps, type StagedRow } from "@/lib/aiImport/extractUnit";
import { prepareFile, type PreparedFile } from "@/lib/aiImport/files/prepare";
import type { UsageRpc } from "@/lib/aiImport/ledger";
import type { ChunkSegment } from "@/lib/aiImport/segment";
import {
  segmentChunk,
  type SegmentChunkDeps,
  type SegmentChunkResult,
} from "@/lib/aiImport/segmentChunk";
import type { StagedEntry } from "@/lib/aiImport/stage";
import { CORPUS_DIR } from "./files";

/**
 * One corpus document through the product's two requests (#594), as the browser drives them:
 * `segmentChunk` for each chunk, then `extractUnit` for each unit until the file says it has no
 * more. Only what those reach outside the process is stood in for: the model (a client handed
 * in), the ledger, and the three tables, kept here in memory.
 *
 * `pipeline.ts` is the eval's shorter road through the same passes. This one takes the server's,
 * so a chunk read in halves, the 150-entry limit and "already staged" are all in play.
 */

// The fake-client switch turns AI import on with no key; the client itself is handed in.
const ENV = { AI_IMPORT_FAKE: "1" };
const REF = { orgId: "org-1", batchId: "batch-1", fileId: "file-1", userId: "teacher-1" };

const allowed = async () => "ok" as const;

export interface PassOptions {
  /** The ledger to reserve under; a new open one when left out. */
  ledger?: Ledger;
  /** The wait between a call's retries. Left out, the product's own: a live run really waits. */
  sleep?: (ms: number) => Promise<void>;
}

export interface CorpusFile {
  name: string;
  bytes: Uint8Array;
  prepared: PreparedFile;
}

export async function corpusFile(name: string): Promise<CorpusFile> {
  const bytes = new Uint8Array(readFileSync(join(CORPUS_DIR, name)));
  const prepared = await prepareFile(bytes, name);
  if (!prepared.ok) throw new Error(`${name}: ${prepared.code}`);
  return { name, bytes, prepared };
}

export interface Ledger {
  rpc: UsageRpc;
  /** What each `reserve_ai_usage` call was sent, in order. */
  reserves: Record<string, unknown>[];
  /** What each `settle_ai_usage` call was sent, in order. */
  settles: Record<string, unknown>[];
}

/** A ledger with room for everything, which writes down what it was asked. */
export function openLedger(): Ledger {
  const reserves: Record<string, unknown>[] = [];
  const settles: Record<string, unknown>[] = [];
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name !== "reserve_ai_usage") {
      settles.push(args);
      return { data: true, error: null };
    }
    reserves.push(args);
    const reservation = {
      allowed: true,
      reason: "ok",
      reservation_id: `res-${reserves.length}`,
      remaining_usd: 9,
      remaining_pages: null,
    };
    return { data: [reservation], error: null };
  };
  return { rpc: rpc as unknown as UsageRpc, reserves, settles };
}

export interface SegmentPass {
  /** `segmentChunk`'s answer for each chunk, in order. */
  results: SegmentChunkResult[];
  /** What was stored in `ai_import_chunks.segments`: one per chunk that parsed. */
  segments: ChunkSegment[];
  ledger: Ledger;
}

/** Every chunk of the file through `segmentChunk`, one request each. */
export async function segmentPass(
  file: CorpusFile,
  client: MessagesClient,
  options: PassOptions = {},
): Promise<SegmentPass> {
  const ledger = options.ledger ?? openLedger();
  const segments: ChunkSegment[] = [];
  const deps: SegmentChunkDeps = {
    env: ENV,
    client: () => client,
    usageRpc: ledger.rpc,
    takeParseCall: allowed,
    loadFile: async () => ({ ok: true, bytes: file.bytes, prepared: file.prepared }),
    storeSegment: async (_ref, _position, segment) => {
      segments.push(segment);
      return "stored";
    },
    ...(options.sleep ? { sleep: options.sleep } : {}),
  };
  const results: SegmentChunkResult[] = [];
  for (const chunk of file.prepared.chunks) {
    results.push(await segmentChunk(deps, { ...REF, position: chunk.position }));
  }
  return { results, segments, ledger };
}

export interface ExtractPass {
  /** How many units the file had. */
  units: number;
  /** Every staged entry, in the order the units staged them. */
  staged: StagedEntry[];
  /** The `ai_import_entries` rows they were inserted as. */
  rows: StagedRow[];
}

/** Every unit of the file through `extractUnit`, from its stored segments. */
export async function extractPass(
  file: CorpusFile,
  client: MessagesClient,
  segments: readonly ChunkSegment[],
  options: PassOptions = {},
): Promise<ExtractPass> {
  const ledger = options.ledger ?? openLedger();
  const rows: StagedRow[] = [];
  const staged: StagedEntry[] = [];
  const deps: ExtractUnitDeps = {
    env: ENV,
    client: () => client,
    usageRpc: ledger.rpc,
    takeExtractCall: allowed,
    loadSegments: async () => ({
      ok: true,
      segments: [...segments],
      chunkIds: new Map(segments.map((segment) => [segment.position, `chunk-${segment.position}`])),
    }),
    loadFile: async () => ({ ok: true, bytes: file.bytes, prepared: file.prepared }),
    filePlace: async () => 0,
    stagedPlaces: async () => ({
      count: rows.length,
      positions: new Set(rows.map((row) => row.position)),
    }),
    insertEntries: async (_ref, added) => {
      rows.push(...added);
      return "ok";
    },
    ...(options.sleep ? { sleep: options.sleep } : {}),
  };
  let units = 1;
  for (let unit = 0; unit < units; unit += 1) {
    const result = await extractUnit(deps, { ...REF, unit });
    if (!result.ok) throw new Error(`${file.name}, unit ${unit}: ${result.code}`);
    if (result.overLimit > 0) throw new Error(`${file.name}: ${result.overLimit} over the limit`);
    units = result.units;
    staged.push(...result.staged);
  }
  return { units, staged, rows };
}

export interface Imported extends ExtractPass {
  file: CorpusFile;
  segments: ChunkSegment[];
  ledger: Ledger;
}

/** The whole import of one corpus document. Throws when a chunk or a unit fails. */
export async function importDocument(name: string, client: MessagesClient): Promise<Imported> {
  const file = await corpusFile(name);
  const { results, segments, ledger } = await segmentPass(file, client);
  results.forEach((result, position) => {
    if (!result.ok) throw new Error(`${name}, chunk ${position}: ${result.code}`);
  });
  const extracted = await extractPass(file, client, segments, { ledger });
  return { file, segments, ledger, ...extracted };
}
