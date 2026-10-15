import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { MAX_FILE_BYTES } from "./limits";
import { prepareFile, type PreparedFile } from "./prepare";
import { REJECTIONS, reject, type Rejection, type RejectionCode } from "./reasons";
import type { FileKind } from "./sniff";

/**
 * The file half of AI import in the database and Storage (#341, on #340's schema).
 *
 * Every function here takes the **service-role** client (`createSupabaseServiceClient`), which
 * bypasses row level security. The caller must first check that the signed-in user is an author
 * of `orgId` (the Server Function does, as for every other author write), and must pass the
 * workspace from that check, never one from the request. Each query is also filtered by
 * workspace and batch, so a file id from another workspace finds nothing.
 *
 * The flow, for #345:
 * 1. `registerFile` adds the row. The database generates its Storage path,
 *    `<org>/<batch>/<file id>`, so no name the teacher chose is ever a path.
 * 2. The browser uploads to that path with the teacher's own session and `contentType`; the
 *    `ai-imports` policy allows it only while the file is `pending` and the batch `uploading`.
 * 3. `checkUploadedFile` downloads the bytes, checks them, and marks the row `ready` with its
 *    kind, size, hash and pages and adds its chunks, or `rejected` with a reason and deletes the
 *    object. Once it is not `pending`, the object can no longer be replaced.
 */

type Client = SupabaseClient<Database>;

export const AI_IMPORT_BUCKET = "ai-imports";

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
};

/** Names refused before any upload, so a teacher hears why at once. The bytes decide the rest. */
const REFUSED_EXTENSIONS: Record<string, RejectionCode> = {
  doc: "legacy_doc",
  dot: "legacy_doc",
  docm: "macro_enabled",
  dotm: "macro_enabled",
};

export interface FileRef {
  orgId: string;
  batchId: string;
  fileId: string;
}

/**
 * Something went wrong that is not decided by the file's content. `changed` is a stored object
 * whose bytes no longer match the hash recorded when it was checked: never parse it.
 */
export interface FileFailure {
  ok: false;
  code: "not_found" | "not_uploaded" | "in_progress" | "unavailable" | "changed";
}

const failure = (code: FileFailure["code"]): FileFailure => ({ ok: false, code });

function logFailure(step: string, error: { code?: string; statusCode?: string } | null): void {
  // The code and nothing else: never a file name, a path or the error's message.
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? error?.statusCode });
}

/** Control characters, and the marks that reverse text direction ("quiz\u202Efdp.exe"). */
const UNSAFE_NAME_CHARACTERS = new RegExp(
  "[\\u0000-\\u001f\\u007f-\\u009f\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]",
  "g",
);

/** A name as shown to the teacher: its last path segment, no control or direction characters. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(UNSAFE_NAME_CHARACTERS, "");
  return Array.from(cleaned.trim()).slice(0, 255).join("");
}

/** The content type to upload a file with, from its name, or why it is refused already. */
export function uploadContentType(name: string): { ok: true; contentType: string } | Rejection {
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase() ?? "";
  const refused = REFUSED_EXTENSIONS[extension];
  if (refused) return reject(refused);
  const contentType = CONTENT_TYPES[extension];
  return contentType ? { ok: true, contentType } : reject("unsupported");
}

export type Registered =
  | { ok: true; fileId: string; storagePath: string; contentType: string; name: string }
  | Rejection
  | FileFailure;

export async function registerFile(
  service: Client,
  ref: Omit<FileRef, "fileId">,
  originalName: string,
): Promise<Registered> {
  const name = cleanFileName(originalName);
  if (!name) return reject("unsupported");
  const type = uploadContentType(name);
  if (!type.ok) return type;

  const { data, error } = await service
    .from("ai_import_files")
    .insert({ org_id: ref.orgId, batch_id: ref.batchId, original_name: name })
    .select("id, storage_path")
    .single();
  if (error || !data?.storage_path) {
    // The batch triggers raise 23514 with a fixed sentence; only that sentence is matched.
    if (error?.code === "23514") {
      return reject(error.message?.includes("at most 5 files") ? "batch_files" : "batch_closed");
    }
    if (error?.code === "23503") return failure("not_found");
    logFailure("registering a file", error);
    return failure("unavailable");
  }
  return {
    ok: true,
    fileId: data.id,
    storagePath: data.storage_path,
    contentType: type.contentType,
    name,
  };
}

export type FileCheck =
  | {
      ok: true;
      status: "ready";
      kind: FileKind;
      pages: number;
      chunks: number;
      /** Pictures replaced by `[image]`; null when the file was checked by an earlier call. */
      images: number | null;
    }
  | { ok: true; status: "rejected"; code: RejectionCode | null; reason: string }
  | FileFailure;

interface FileRow {
  id: string;
  original_name: string;
  status: string;
  kind: string | null;
  pages: number | null;
  rejected_reason: string | null;
  storage_path: string | null;
}

async function readFile(service: Client, ref: FileRef): Promise<FileRow | null | "error"> {
  const { data, error } = await service
    .from("ai_import_files")
    .select("id, original_name, status, kind, pages, rejected_reason, storage_path")
    .eq("id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId)
    .maybeSingle();
  if (error) {
    logFailure("reading a file", error);
    return "error";
  }
  return data;
}

/** A file checked already answers as it was checked; checking twice changes nothing. */
async function alreadyChecked(service: Client, row: FileRow, ref: FileRef): Promise<FileCheck> {
  if (row.status === "rejected") {
    const code = (Object.keys(REJECTIONS) as RejectionCode[]).find(
      (key) => REJECTIONS[key] === row.rejected_reason,
    );
    return {
      ok: true,
      status: "rejected",
      code: code ?? null,
      reason: row.rejected_reason ?? REJECTIONS.corrupt,
    };
  }
  const { count, error } = await service
    .from("ai_import_chunks")
    .select("id", { count: "exact", head: true })
    .eq("file_id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId);
  if (error) logFailure("counting chunks", error);
  return {
    ok: true,
    status: "ready",
    kind: row.kind as FileKind,
    pages: row.pages ?? 0,
    chunks: count ?? 0,
    images: null,
  };
}

async function removeObject(service: Client, path: string): Promise<void> {
  const { error } = await service.storage.from(AI_IMPORT_BUCKET).remove([path]);
  if (error) logFailure("deleting a refused file", error as { statusCode?: string });
}

async function deleteChunks(service: Client, ref: FileRef): Promise<void> {
  const { error } = await service
    .from("ai_import_chunks")
    .delete()
    .eq("file_id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId);
  if (error) logFailure("deleting chunks", error);
}

/** Marks a pending file refused and deletes its object: nothing of it is kept but the reason. */
async function refuse(
  service: Client,
  ref: FileRef,
  path: string,
  rejection: Rejection,
  sizeBytes: number | null,
): Promise<FileCheck> {
  const { data, error } = await service
    .from("ai_import_files")
    .update({
      status: "rejected",
      rejected_reason: rejection.reason,
      size_bytes:
        sizeBytes !== null && sizeBytes >= 1 && sizeBytes <= MAX_FILE_BYTES ? sizeBytes : null,
    })
    .eq("id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId)
    .eq("status", "pending")
    .select("id");
  if (error) {
    logFailure("refusing a file", error);
    return failure("unavailable");
  }
  // Another call decided first: its verdict stands, and the object is not this call's to delete.
  if (!data || data.length === 0) return failure("in_progress");
  await removeObject(service, path);
  return { ok: true, status: "rejected", code: rejection.code, reason: rejection.reason };
}

async function download(
  service: Client,
  path: string,
): Promise<{ ok: true; blob: Blob } | FileFailure> {
  const { data, error } = await service.storage.from(AI_IMPORT_BUCKET).download(path);
  if (error || !data) {
    const status = (error as { status?: number; statusCode?: string } | null)?.status;
    const statusCode = (error as { statusCode?: string } | null)?.statusCode;
    if (status === 400 || status === 404 || statusCode === "404" || statusCode === "400") {
      return failure("not_uploaded");
    }
    logFailure("downloading a file", error as { statusCode?: string });
    return failure("unavailable");
  }
  return { ok: true, blob: data };
}

/**
 * Checks the uploaded bytes of one file and records the verdict. Safe to call again: a file that
 * is no longer `pending` answers as it was decided, and two calls at once cannot both add chunks
 * (`ai_import_chunks` is unique on file and position).
 */
export async function checkUploadedFile(service: Client, ref: FileRef): Promise<FileCheck> {
  const row = await readFile(service, ref);
  if (row === "error") return failure("unavailable");
  if (!row || !row.storage_path) return failure("not_found");
  if (row.status !== "pending") return alreadyChecked(service, row, ref);
  const path = row.storage_path;

  const downloaded = await download(service, path);
  if (!downloaded.ok) return downloaded;
  if (downloaded.blob.size > MAX_FILE_BYTES) {
    return refuse(service, ref, path, reject("too_large"), null);
  }
  const bytes = new Uint8Array(await downloaded.blob.arrayBuffer());
  let prepared: Awaited<ReturnType<typeof prepareFile>>;
  try {
    prepared = await prepareFile(bytes, row.original_name);
  } catch {
    // A parser failing in a way the checks did not foresee: the file is unreadable, not pending.
    prepared = reject("corrupt");
  }
  if (!prepared.ok) return refuse(service, ref, path, prepared, bytes.length);

  const { error: chunkError } = await service.from("ai_import_chunks").insert(
    prepared.chunks.map((chunk) => ({
      file_id: ref.fileId,
      batch_id: ref.batchId,
      org_id: ref.orgId,
      position: chunk.position,
      page_from: chunk.pageFrom,
      page_to: chunk.pageTo,
    })),
  );
  if (chunkError) {
    if (chunkError.code === "23505") return failure("in_progress");
    logFailure("adding chunks", chunkError);
    return failure("unavailable");
  }

  const { data: updated, error: updateError } = await service
    .from("ai_import_files")
    .update({
      status: "ready",
      kind: prepared.kind,
      size_bytes: prepared.sizeBytes,
      sha256: prepared.sha256,
      pages: prepared.pages,
    })
    .eq("id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId)
    .eq("status", "pending")
    .select("id");
  if (updateError || !updated || updated.length === 0) {
    await deleteChunks(service, ref);
    if (updateError?.code === "23505") {
      return refuse(service, ref, path, reject("duplicate"), prepared.sizeBytes);
    }
    if (updateError?.code === "23514") {
      return refuse(service, ref, path, reject("batch_pages"), prepared.sizeBytes);
    }
    if (updateError) {
      logFailure("marking a file ready", updateError);
      return failure("unavailable");
    }
    return failure("in_progress");
  }

  return {
    ok: true,
    status: "ready",
    kind: prepared.kind,
    pages: prepared.pages,
    chunks: prepared.chunks.length,
    images: prepared.images,
  };
}

/**
 * The bytes of a file that passed its check, prepared again, for the parse step (#342).
 *
 * A teacher may delete their own workspace's objects, and while a file is `pending` may upload to
 * its path, so the object read now is not necessarily the one that was checked. Its SHA-256 must
 * match the one recorded at the check, or it is refused as `changed`; the same bytes then give
 * the same chunks, so `chunkPayload(bytes, prepared, position)` is chunk `position` in
 * `ai_import_chunks`.
 */
export async function loadCheckedFile(
  service: Client,
  ref: FileRef,
): Promise<{ ok: true; bytes: Uint8Array; prepared: PreparedFile } | FileFailure> {
  const { data: row, error } = await service
    .from("ai_import_files")
    .select("original_name, status, sha256, storage_path")
    .eq("id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId)
    .maybeSingle();
  if (error) {
    logFailure("reading a file", error);
    return failure("unavailable");
  }
  if (!row?.storage_path || row.status !== "ready" || !row.sha256) return failure("not_found");

  const downloaded = await download(service, row.storage_path);
  if (!downloaded.ok) return downloaded;
  if (downloaded.blob.size > MAX_FILE_BYTES) return failure("changed");
  const bytes = new Uint8Array(await downloaded.blob.arrayBuffer());
  const prepared = await prepareFile(bytes, row.original_name);
  if (!prepared.ok || prepared.sha256 !== row.sha256) return failure("changed");
  return { ok: true, bytes, prepared };
}

/**
 * Takes a file out of a batch that is still uploading: its object first, then its row (and its
 * chunks with it), as #340 asks. A refused file still counts towards the 5, so this frees its
 * place.
 */
export async function removeFile(
  service: Client,
  ref: FileRef,
): Promise<{ ok: true } | Rejection | FileFailure> {
  const row = await readFile(service, ref);
  if (row === "error") return failure("unavailable");
  if (!row || !row.storage_path) return failure("not_found");
  const { data: batch, error: batchError } = await service
    .from("ai_import_batches")
    .select("status")
    .eq("id", ref.batchId)
    .eq("org_id", ref.orgId)
    .maybeSingle();
  if (batchError) {
    logFailure("reading a batch", batchError);
    return failure("unavailable");
  }
  // Once parsing has started, chunks and entries hang off the file; discard the batch instead.
  if (batch?.status !== "uploading") return reject("batch_closed");
  const { error: storageError } = await service.storage
    .from(AI_IMPORT_BUCKET)
    .remove([row.storage_path]);
  if (storageError) {
    logFailure("deleting a file's object", storageError as { statusCode?: string });
    return failure("unavailable");
  }
  const { error } = await service
    .from("ai_import_files")
    .delete()
    .eq("id", ref.fileId)
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId);
  if (error) {
    logFailure("deleting a file", error);
    return failure("unavailable");
  }
  return { ok: true };
}
