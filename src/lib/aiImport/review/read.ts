import type { BatchStatus } from "@/lib/authoring/aiImportUpload";
import {
  readStoredReasons,
  type ReviewEntryView,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import { ITEM_TYPES } from "@/lib/ngn/labels";
import type { ItemType } from "@/lib/ngn/schemas";
import { removedPlaces, withoutRemoved } from "../places";
import { cutEnd } from "../textCut";
import type { Client } from "../upload/access";

/**
 * What the review screen shows of a batch (#346): its files' names in upload order and every
 * staged entry with its item, key included. Read with the teacher's own session, so RLS ("authors
 * read AI import entries") decides as well as the filters on the session's workspace. Never the
 * model's draft, which the screen does not need.
 *
 * Each entry's source (#593) is its whole part of a text document. A PDF has no text here, so its
 * entry keeps the opening words and says which pages it was read from, which its chunk gives.
 *
 * A file the teacher removed (#591) keeps its name in `fileNames`, so every other file keeps its
 * place; an entry at its place is left out. Such an entry can only be one a request staged after
 * the removal, and the import deletes it (`importBatch`).
 */

export interface ReviewBatch {
  id: string;
  status: BatchStatus;
  bankId: string | null;
  fileNames: string[];
  entries: ReviewEntryView[];
  /** #592: answer sections that reached no question, counted when reading finished. */
  answers: { unmatched: number; dropped: number };
}

/** A count stored on the batch; 0 for anything that is not a whole number of answers. */
const countOf = (value: unknown): number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;

/** The answer counts in `ai_import_batches.source`, which older batches do not have. */
export function answersOf(source: unknown): ReviewBatch["answers"] {
  const stored = typeof source === "object" && source !== null ? source : {};
  const { unmatchedAnswers, droppedAnswers } = stored as Record<string, unknown>;
  return { unmatched: countOf(unmatchedAnswers), dropped: countOf(droppedAnswers) };
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
  /** The first chunk it was read from; null once that chunk is gone. */
  chunk_id?: string | null;
}

export const ENTRY_COLUMNS =
  "id, version, position, kind, type, status, reasons, source_excerpt, item, group_key, step, chunk_id";

/** The pages a PDF's chunk covers, by chunk id. A text file's chunk has none and is left out. */
export type ChunkPages = ReadonlyMap<string, { from: number; to: number }>;

export function chunkPages(
  chunks: readonly { id: string; page_from: number | null; page_to: number | null }[],
): ChunkPages {
  return new Map(
    chunks.flatMap((chunk) =>
      chunk.page_from !== null && chunk.page_to !== null
        ? [[chunk.id, { from: chunk.page_from, to: chunk.page_to }] as const]
        : [],
    ),
  );
}

/**
 * How much of a question's source the review list sends. A source can be 20,000 characters, and
 * the list holds up to 150 questions and is sent again after every change: whole, that is about
 * 3 MB each time. This much shows a question with its options and answer line; a longer one is
 * cut here and shown whole on its edit page.
 */
export const LIST_SOURCE_LIMIT = 4_000;

/** `text` in at most `limit` characters, ending on a whole line where one ends near the limit. */
export function listSource(text: string, limit: number): { text: string; cut: boolean } {
  if (text.length <= limit) return { text, cut: false };
  const head = cutEnd(text, limit);
  const line = head.lastIndexOf("\n");
  return { text: (line >= limit * 0.75 ? head.slice(0, line) : head).trimEnd(), cut: true };
}

export function toEntryView(
  row: EntryRow,
  pages: ChunkPages = new Map(),
  /** The most source to send; everything by default (the edit page, and callers that send none). */
  sourceLimit = Infinity,
): ReviewEntryView {
  // A case study is six questions and has no edit page of its own, so it is sent whole.
  const source = listSource(row.source_excerpt, row.kind === "case_study" ? Infinity : sourceLimit);
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
    sourceExcerpt: source.text,
    ...(source.cut ? { sourceCut: true } : {}),
    sourcePages: (row.chunk_id ? pages.get(row.chunk_id) : undefined) ?? null,
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
  const [batch, files, entries, chunks] = await Promise.all([
    client
      .from("ai_import_batches")
      .select("id, status, bank_id, source")
      .eq("id", batchId)
      .eq("org_id", orgId)
      .eq("bank_id", bankId)
      .maybeSingle(),
    client
      .from("ai_import_files")
      .select("original_name, status, rejected_reason")
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
    client
      .from("ai_import_chunks")
      .select("id, page_from, page_to")
      .eq("batch_id", batchId)
      .eq("org_id", orgId),
  ]);
  const error = batch.error ?? files.error ?? entries.error ?? chunks.error;
  if (error) {
    logged("reading a batch for review", error);
    return "unavailable";
  }
  if (!batch.data) return null;
  const shown = withoutRemoved((entries.data ?? []) as EntryRow[], removedPlaces(files.data ?? []));
  const pages = chunkPages(chunks.data ?? []);
  return {
    id: batch.data.id,
    status: batch.data.status as BatchStatus,
    bankId: batch.data.bank_id,
    fileNames: (files.data ?? []).map((file) => file.original_name),
    entries: shown.map((row) => toEntryView(row, pages, LIST_SOURCE_LIMIT)),
    answers: answersOf(batch.data.source),
  };
}
