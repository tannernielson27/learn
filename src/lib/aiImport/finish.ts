import type { SupabaseClient } from "@supabase/supabase-js";
import { assembleImport, type AssembledImport } from "@/lib/ngn/draft";
import type { Database, Json } from "@/lib/supabase/database.types";
import { markDuplicates } from "./duplicates";
import { mergeSource, type SegmentSource } from "./segment";
import { loadFileSegments } from "./segmentStore";

/**
 * After the last extract unit of a batch (#343): the step #345 runs once, before the batch moves
 * to review. It flags duplicates (`markDuplicates`) and records what the documents say about
 * themselves (author, objectives, references) on `ai_import_batches.source`, through #344's
 * `assembleImport`, which keeps it off every question. Running it twice gives the same result.
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
  for (const file of files.data ?? []) {
    const loaded = await loadFileSegments(service, { ...ref, fileId: file.id });
    if (!loaded.ok) return loaded.code === "unavailable" ? "unavailable" : "incomplete";
    sources.push(mergeSource(loaded.segments));
  }
  const { error } = await service
    .from("ai_import_batches")
    .update({ source: batchSource(sources) as unknown as Json })
    .eq("id", ref.batchId)
    .eq("org_id", ref.orgId);
  if (error) {
    logged("recording a batch's source", error);
    return "unavailable";
  }
  return "ok";
}

/** Duplicates flagged and the source matter recorded: the batch is ready for review. */
export async function finishExtraction(
  service: Client,
  ref: { orgId: string; batchId: string },
): Promise<{ ok: true; duplicates: number } | { ok: false; code: "incomplete" | "unavailable" }> {
  const source = await recordBatchSource(service, ref);
  if (source !== "ok") return { ok: false, code: source };
  const duplicates = await markDuplicates(service, ref);
  if (!duplicates.ok) return duplicates;
  return { ok: true, duplicates: duplicates.changed };
}
