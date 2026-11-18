import type { SupabaseClient } from "@supabase/supabase-js";
import { assembleImport, type AssembledImport } from "@/lib/ngn/draft";
import type { Database, Json } from "@/lib/supabase/database.types";
import { markDuplicates } from "./duplicates";
import { mergeSegments } from "./merge";
import { mergeSource, type ChunkSegment, type SegmentSource } from "./segment";
import { loadFileSegments } from "./segmentStore";

/**
 * After the last extract unit of a batch (#343): the step #345 runs once, before the batch moves
 * to review. It flags duplicates (`markDuplicates`) and records what the documents say about
 * themselves (author, objectives, references) on `ai_import_batches.source`, through #344's
 * `assembleImport`, which keeps it off every question. Running it twice gives the same result.
 *
 * It also counts the answer sections that reached no question (#592), on the same column: ones
 * that matched no question or more than one (`mergeSegments`), and ones the model reported that
 * the document does not hold (`readSegment`). Neither was shown anywhere, so a teacher could not
 * tell why a question with its answer "at the back" came out needing one. The column's check
 * asks only for an object with its two lists, so the counts sit beside them with no migration.
 */

type Client = SupabaseClient<Database>;

/** The batch's source matter from each file's: the first author, each line once, in file order. */
export function batchSource(files: readonly SegmentSource[]): AssembledImport["source"] {
  const author = files.find((file) => file.author !== null)?.author ?? undefined;
  const unique = (values: string[]) => [...new Set(values)];
  return assembleImport([], {
    source: {
      ...(author !== undefined ? { author } : {}),
      objectives: unique(files.flatMap((file) => file.objectives)),
      references: unique(files.flatMap((file) => file.references)),
    },
  }).source;
}

/** Answer sections that reached no question, across a batch's files. */
export interface AnswerCounts {
  /** Printed in the document, but matching no question's number, or more than one. */
  unmatchedAnswers: number;
  /** Reported by the model, but not found in the document's text, so left out. */
  droppedAnswers: number;
}

export type BatchSource = AssembledImport["source"] & AnswerCounts;

/** One file's counts, from all its chunks' segments. */
export function answerCounts(segments: readonly ChunkSegment[]): AnswerCounts {
  return {
    unmatchedAnswers: mergeSegments(segments).unlinkedAnswers.length,
    droppedAnswers: segments.reduce((sum, segment) => sum + segment.droppedAnswers, 0),
  };
}

const logged = (step: string, error: { code?: string } | null) => {
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

/** Writes the batch's source matter from every file's stored segments, on the service client. */
export async function recordBatchSource(
  service: Client,
  ref: { orgId: string; batchId: string },
): Promise<"ok" | "incomplete" | "unavailable"> {
  const files = await service
    .from("ai_import_files")
    .select("id")
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId)
    .eq("status", "ready")
    .order("created_at")
    .order("id");
  if (files.error) {
    logged("reading a batch's files", files.error);
    return "unavailable";
  }
  const sources: SegmentSource[] = [];
  const counts: AnswerCounts[] = [];
  for (const file of files.data ?? []) {
    const loaded = await loadFileSegments(service, { ...ref, fileId: file.id });
    if (!loaded.ok) return loaded.code === "unavailable" ? "unavailable" : "incomplete";
    sources.push(mergeSource(loaded.segments));
    counts.push(answerCounts(loaded.segments));
  }
  const source: BatchSource = {
    ...batchSource(sources),
    unmatchedAnswers: counts.reduce((sum, file) => sum + file.unmatchedAnswers, 0),
    droppedAnswers: counts.reduce((sum, file) => sum + file.droppedAnswers, 0),
  };
  const { error } = await service
    .from("ai_import_batches")
    .update({ source: source as unknown as Json })
    .eq("id", ref.batchId)
    .eq("org_id", ref.orgId);
  if (error) {
    logged("recording a batch's source", error);
    return "unavailable";
  }
  return "ok";
}

/**
 * Duplicates flagged and the source matter recorded: the batch is ready for review. A file the
 * teacher removed (#591) gives neither: the source matter is read from ready files only, and the
 * duplicate pass leaves out the `removed` places.
 */
export async function finishExtraction(
  service: Client,
  ref: { orgId: string; batchId: string },
  removed: ReadonlySet<number> = new Set(),
): Promise<{ ok: true; duplicates: number } | { ok: false; code: "incomplete" | "unavailable" }> {
  const source = await recordBatchSource(service, ref);
  if (source !== "ok") return { ok: false, code: source };
  const duplicates = await markDuplicates(service, ref, removed);
  if (!duplicates.ok) return duplicates;
  return { ok: true, duplicates: duplicates.changed };
}
