import type { BatchStatus } from "@/lib/authoring/aiImportUpload";
import {
  readStoredReasons,
  type ReviewEntryView,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import type { ItemType } from "@/lib/ngn/schemas";
import type { Client } from "../upload/access";

/**
 * What the review screen shows of a batch (#346): its files' names in upload order and every
 * staged entry with its item, key included. Read with the teacher's own session, so RLS ("authors
 * read AI import entries") decides as well as the filters on the session's workspace. Never the
 * model's draft, which the screen does not need.
 */

export interface ReviewBatch {
  id: string;
  status: BatchStatus;
  bankId: string | null;
  fileNames: string[];
  entries: ReviewEntryView[];
}

const logged = (step: string, error: { code?: string } | null) => {
  // The code and nothing else: never an entry, which holds the document's words and keys.
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

const STATUSES: readonly ReviewStatus[] = [
  "ready",
  "needs_answer",
  "needs_fix",
  "not_importable",
  "dropped",
];

const typeOf = (type: string | null): ItemType | null =>
  type !== null && (ITEM_TYPES as readonly string[]).includes(type) ? (type as ItemType) : null;

export interface EntryRow {
  id: string;
  version: number;
  position: number;
  kind: string;
  type: string | null;
  status: string;
  reasons: string[];
  source_excerpt: string;
  item: unknown;
  group_key: string | null;
  step: number | null;
}

export const ENTRY_COLUMNS =
  "id, version, position, kind, type, status, reasons, source_excerpt, item, group_key, step";

export function toEntryView(row: EntryRow): ReviewEntryView {
  return {
    id: row.id,
    version: row.version,
    position: row.position,
    kind: row.kind === "case_study" ? "case_study" : "item",
    type: typeOf(row.type),
    status: STATUSES.includes(row.status as ReviewStatus)
      ? (row.status as ReviewStatus)
      : "needs_fix",
    reasons: readStoredReasons(row.reasons ?? []),
    sourceExcerpt: row.source_excerpt,
    item: row.item ?? null,
    group: row.group_key ? { title: row.group_key, step: row.step } : null,
  };
}

/** A batch of this workspace and quiz with its entries; null when there is none to show. */
export async function readReviewBatch(
  client: Client,
  orgId: string,
  batchId: string,
  bankId: string,
): Promise<ReviewBatch | null | "unavailable"> {
  const [batch, files, entries] = await Promise.all([
    client
      .from("ai_import_batches")
      .select("id, status, bank_id")
      .eq("id", batchId)
      .eq("org_id", orgId)
      .eq("bank_id", bankId)
      .maybeSingle(),
    client
      .from("ai_import_files")
      .select("original_name")
      .eq("batch_id", batchId)
      .eq("org_id", orgId)
      .order("created_at")
      .order("id"),
    client
      .from("ai_import_entries")
      .select(ENTRY_COLUMNS)
      .eq("batch_id", batchId)
      .eq("org_id", orgId)
      .order("position"),
  ]);
  const error = batch.error ?? files.error ?? entries.error;
  if (error) {
    logged("reading a batch for review", error);
    return "unavailable";
  }
  if (!batch.data) return null;
  return {
    id: batch.data.id,
    status: batch.data.status as BatchStatus,
    bankId: batch.data.bank_id,
    fileNames: (files.data ?? []).map((file) => file.original_name),
    entries: ((entries.data ?? []) as EntryRow[]).map(toEntryView),
  };
}
