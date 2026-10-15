import type {
  BatchStatus,
  BatchView,
  ChunkStatus,
  FileStatus,
  FileView,
} from "@/lib/authoring/aiImportUpload";
import { POSITIONS_PER_FILE } from "../extractUnit";
import type { Client } from "./access";

/**
 * What the upload page shows of a batch (#345): its files in upload order, each file's chunks and
 * how many questions it has staged. Read on the service client, filtered by the session's
 * workspace. Names, statuses and counts only: never a segment, a draft or an item.
 */

const logged = (step: string, error: { code?: string } | null) => {
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

/** The batch the page should open: the newest one of this quiz still uploading or reading. */
export async function openBatchId(
  service: Client,
  orgId: string,
  bankId: string,
): Promise<string | null | "unavailable"> {
  const { data, error } = await service
    .from("ai_import_batches")
    .select("id")
    .eq("org_id", orgId)
    .eq("bank_id", bankId)
    .in("status", ["uploading", "parsing"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    logged("finding an open batch", error);
    return "unavailable";
  }
  return data?.[0]?.id ?? null;
}

export async function readBatchView(
  service: Client,
  orgId: string,
  batchId: string,
  /** When given, a batch of another quiz is not found. */
  bankId?: string,
): Promise<BatchView | null | "unavailable"> {
  let batchQuery = service
    .from("ai_import_batches")
    .select("id, status")
    .eq("id", batchId)
    .eq("org_id", orgId);
  if (bankId !== undefined) batchQuery = batchQuery.eq("bank_id", bankId);
  const [batch, files, chunks, entries] = await Promise.all([
    batchQuery.maybeSingle(),
    service
      .from("ai_import_files")
      .select("id, original_name, status, rejected_reason, pages")
      .eq("batch_id", batchId)
      .eq("org_id", orgId)
      .order("created_at")
      .order("id"),
    service
      .from("ai_import_chunks")
      .select("file_id, position, status")
      .eq("batch_id", batchId)
      .eq("org_id", orgId)
      .order("position"),
    service
      .from("ai_import_entries")
      .select("position")
      .eq("batch_id", batchId)
      .eq("org_id", orgId),
  ]);
  const error = batch.error ?? files.error ?? chunks.error ?? entries.error;
  if (error) {
    logged("reading a batch", error);
    return "unavailable";
  }
  if (!batch.data) return null;

  const fileViews: FileView[] = (files.data ?? []).map((file, place) => ({
    id: file.id,
    name: file.original_name,
    status: file.status as FileStatus,
    reason: file.rejected_reason,
    pages: file.pages,
    chunks: (chunks.data ?? [])
      .filter((chunk) => chunk.file_id === file.id)
      .map((chunk) => ({ position: chunk.position, status: chunk.status as ChunkStatus })),
    // Entries sit at `file order * 1000 + place in the file` (#343), in the same file order.
    questions: (entries.data ?? []).filter(
      (entry) => Math.floor(entry.position / POSITIONS_PER_FILE) === place,
    ).length,
  }));
  return { id: batch.data.id, status: batch.data.status as BatchStatus, files: fileViews };
}

export interface Allowance {
  remainingUsd: number;
  remainingPages: number | null;
}

/** What is left of the workspace's monthly cap, as the ledger sees it now (UTC months). */
export async function readAllowance(
  service: Client,
  orgId: string,
  now: Date = new Date(),
): Promise<Allowance | "unavailable"> {
  const month = `${now.toISOString().slice(0, 7)}-01`;
  const [org, usage] = await Promise.all([
    service
      .from("orgs")
      .select("ai_import_monthly_cap_usd, ai_import_monthly_page_cap")
      .eq("id", orgId)
      .maybeSingle(),
    service
      .from("ai_usage")
      .select("cost_used_usd, cost_reserved_usd, pages_used, pages_reserved")
      .eq("org_id", orgId)
      .eq("month", month)
      .maybeSingle(),
  ]);
  if (org.error || usage.error || !org.data) {
    logged("reading the allowance", org.error ?? usage.error);
    return "unavailable";
  }
  const spent = Number(usage.data?.cost_used_usd ?? 0) + Number(usage.data?.cost_reserved_usd ?? 0);
  const pages = (usage.data?.pages_used ?? 0) + (usage.data?.pages_reserved ?? 0);
  const pageCap = org.data.ai_import_monthly_page_cap;
  return {
    remainingUsd: Math.max(0, Number(org.data.ai_import_monthly_cap_usd) - spent),
    remainingPages: pageCap === null ? null : Math.max(0, pageCap - pages),
  };
}
