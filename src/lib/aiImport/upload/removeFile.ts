import { REMOVED_REASON, isRemovedFile } from "../files/reasons";
import { POSITIONS_PER_FILE } from "../places";
import { AI_IMPORT_BUCKET, type FileRef } from "../files/store";
import type { Client } from "./access";

/**
 * Taking a file out of an import that is already reading (#591), so one file that cannot be read
 * does not hold the others back from review.
 *
 * The file's row is kept and marked refused with `REMOVED_REASON`; it is not deleted. A question
 * sits at `file place * 1000 + n`, and a file's place is its order among the batch's rows, so
 * deleting a row would move every later file down a place and leave its staged questions filed
 * under the wrong file (and read a second time). Keeping the row keeps every place where it was.
 * What goes is everything that made the file part of the import: its chunks, the questions staged
 * at its place, and its uploaded object. The row goes with the batch.
 *
 * Service-role client, like the rest of `src/lib/aiImport`: the caller has checked the teacher
 * and passes the workspace from the session. Every query is filtered by workspace and batch.
 */

type BatchRef = Pick<FileRef, "orgId" | "batchId">;

interface PlacedFile {
  id: string;
  /** Its order among the batch's files, from 0: where its questions are filed. */
  place: number;
  status: string;
  removed: boolean;
  storagePath: string | null;
}

const logged = (step: string, error: { code?: string; statusCode?: string } | null) => {
  // The code and nothing else: never a file name or a path.
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? error?.statusCode ?? null });
};

/** The batch's files in upload order, the order `filePlace` and the review screen count in. */
async function placedFiles(service: Client, ref: BatchRef): Promise<PlacedFile[] | "unavailable"> {
  const { data, error } = await service
    .from("ai_import_files")
    .select("id, status, rejected_reason, storage_path")
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId)
    .order("created_at")
    .order("id");
  if (error) {
    logged("reading a batch's files", error);
    return "unavailable";
  }
  return (data ?? []).map((file, place) => ({
    id: file.id,
    place,
    status: file.status,
    removed: isRemovedFile(file),
    storagePath: file.storage_path,
  }));
}

/** Deletes what a file left in the import: its chunks, and the questions staged at its place. */
async function clearFile(service: Client, ref: FileRef, place: number): Promise<boolean> {
  const [chunks, entries] = await Promise.all([
    service
      .from("ai_import_chunks")
      .delete()
      .eq("file_id", ref.fileId)
      .eq("batch_id", ref.batchId)
      .eq("org_id", ref.orgId),
    service
      .from("ai_import_entries")
      .delete()
      .eq("batch_id", ref.batchId)
      .eq("org_id", ref.orgId)
      .gte("position", place * POSITIONS_PER_FILE)
      .lt("position", (place + 1) * POSITIONS_PER_FILE),
  ]);
  if (chunks.error) logged("deleting a removed file's chunks", chunks.error);
  if (entries.error) logged("deleting a removed file's questions", entries.error);
  return !chunks.error && !entries.error;
}

export type RemovedFile = { ok: true } | { ok: false; code: "not_found" | "unavailable" };

/**
 * Removes one file from a batch that is reading. Safe to run again: a file already removed is
 * cleared once more, which is how a removal that failed half way is finished.
 */
export async function removeReadingFile(service: Client, ref: FileRef): Promise<RemovedFile> {
  const files = await placedFiles(service, ref);
  if (files === "unavailable") return { ok: false, code: "unavailable" };
  const file = files.find((candidate) => candidate.id === ref.fileId);
  if (!file) return { ok: false, code: "not_found" };

  // Marked first: a file that is not `ready` is read by no later request (`loadCheckedFile`), so
  // nothing new is paid for or staged from it once this has happened.
  const { error } = await service
    .from("ai_import_files")
    .update({ status: "rejected", rejected_reason: REMOVED_REASON })
    .eq("id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId);
  if (error) {
    logged("marking a file removed", error);
    return { ok: false, code: "unavailable" };
  }
  if (!(await clearFile(service, ref, file.place))) return { ok: false, code: "unavailable" };

  if (file.storagePath) {
    // The teacher asked for the file to go, so its bytes go now. If this fails the object is
    // still queued when the batch's rows are deleted (`ai_import_object_deletes`).
    const removed = await service.storage.from(AI_IMPORT_BUCKET).remove([file.storagePath]);
    if (removed.error) {
      logged("deleting a removed file's object", removed.error as { statusCode?: string });
    }
  }
  return { ok: true };
}

export type ClearedFiles =
  | { ok: true; /** Files still part of the import. */ ready: number; removed: ReadonlySet<number> }
  | { ok: false; code: "unavailable" };

/**
 * Clears every removed file once more, and answers the files that are left and the places that
 * were removed. Run before a batch moves to review and again just before it is imported: a
 * request that was already reading a file when it was removed may stage a question afterwards,
 * and this is where that question goes. It cannot catch one that lands later still, so callers
 * also leave the `removed` places out of what they read (`places.ts`).
 */
export async function clearRemovedFiles(service: Client, ref: BatchRef): Promise<ClearedFiles> {
  const files = await placedFiles(service, ref);
  if (files === "unavailable") return { ok: false, code: "unavailable" };
  const gone = files.filter((file) => file.removed);
  const cleared = await Promise.all(
    gone.map((file) => clearFile(service, { ...ref, fileId: file.id }, file.place)),
  );
  if (cleared.includes(false)) return { ok: false, code: "unavailable" };
  return {
    ok: true,
    ready: files.filter((file) => file.status === "ready").length,
    removed: new Set(gone.map((file) => file.place)),
  };
}
