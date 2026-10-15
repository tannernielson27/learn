import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DRAFT_TYPES } from "@/lib/ngn/draft";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { FileRef } from "./files/store";
import type { ChunkSegment } from "./segment";

/**
 * Where each chunk's segment answer is kept between the two passes (#343, owner decision
 * 2026-10-15): `ai_import_chunks.segments`, written by the server only (service role). The
 * extract pass reads every chunk of a file back and merges them (`mergeSegments`).
 *
 * What is read back is parsed again before anything trusts it: the column's check only says it
 * is an object with two lists.
 */

type Client = SupabaseClient<Database>;

const text = z.string().max(20_000);

const segmentQuestionSchema = z.object({
  chunk: z.number().int().min(0),
  index: z.number().int().min(0),
  excerpt: text,
  number: text.nullable(),
  page: z.number().int().min(1).nullable(),
  type: z.enum(DRAFT_TYPES).nullable(),
  confidence: z.number().min(0).max(1),
  group: z.object({ title: text, step: z.number().int().min(1).max(6).nullable() }).nullable(),
  scoringRule: text.nullable(),
  flags: z.object({
    instructorNote: z.boolean(),
    reliesOnImage: z.boolean(),
    notNgn: text.nullable(),
    notInSource: z.boolean(),
  }),
  sourceChecked: z.boolean(),
  cutOff: z.boolean(),
  continued: z.boolean(),
});

const segmentAnswerSchema = z.object({
  chunk: z.number().int().min(0),
  number: text,
  caseStudy: text.nullable(),
  kind: z.enum(["answer", "rationale", "answer_and_rationale"]),
  text,
  sourceChecked: z.boolean(),
});

export const storedSegmentSchema = z.object({
  position: z.number().int().min(0).max(999),
  pageFrom: z.number().int().min(1).nullable(),
  pageTo: z.number().int().min(1).nullable(),
  questions: z.array(segmentQuestionSchema).max(200),
  answers: z.array(segmentAnswerSchema).max(200),
  droppedAnswers: z.number().int().min(0),
});

/** A chunk's stored segment, or null when it is missing or not what the server wrote. */
export function readStoredSegment(value: unknown): ChunkSegment | null {
  const parsed = storedSegmentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export type SegmentStore = (
  ref: FileRef,
  position: number,
  segment: ChunkSegment,
) => Promise<"stored" | "not_found" | "unavailable">;

const logged = (step: string, error: { code?: string } | null) => {
  // The code and nothing else: never the segment, which holds the document's words.
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

/** Writes one chunk's segment answer, on the service-role client. */
export function storeChunkSegment(service: Client): SegmentStore {
  return async (ref, position, segment) => {
    const { data, error } = await service
      .from("ai_import_chunks")
      .update({ segments: segment as unknown as Json })
      .eq("file_id", ref.fileId)
      .eq("batch_id", ref.batchId)
      .eq("org_id", ref.orgId)
      .eq("position", position)
      .select("id");
    if (error) {
      logged("storing a chunk's segments", error);
      return "unavailable";
    }
    return data && data.length > 0 ? "stored" : "not_found";
  };
}

export interface FileSegments {
  /** Every chunk's segment, in order. */
  segments: ChunkSegment[];
  /** `ai_import_chunks.id` by position, for the entries' `chunk_id`. */
  chunkIds: Map<number, string>;
}

export type FileSegmentsResult =
  ({ ok: true } & FileSegments) | { ok: false; code: "not_found" | "incomplete" | "unavailable" };

/**
 * Every chunk of a file with its segment answer. `incomplete` while any chunk has none yet, or
 * one that does not read back: the merge needs all of them, or a question split across a
 * boundary would be staged twice.
 */
export async function loadFileSegments(service: Client, ref: FileRef): Promise<FileSegmentsResult> {
  const { data, error } = await service
    .from("ai_import_chunks")
    .select("id, position, segments")
    .eq("file_id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId)
    .order("position");
  if (error) {
    logged("reading a file's segments", error);
    return { ok: false, code: "unavailable" };
  }
  if (!data || data.length === 0) return { ok: false, code: "not_found" };
  const segments: ChunkSegment[] = [];
  const chunkIds = new Map<number, string>();
  for (const row of data) {
    const segment = readStoredSegment(row.segments);
    if (!segment || segment.position !== row.position) return { ok: false, code: "incomplete" };
    segments.push(segment);
    chunkIds.set(row.position, row.id);
  }
  return { ok: true, segments, chunkIds };
}
