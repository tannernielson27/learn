import { isUuid } from "@/lib/authoring/ids";
import { messageFor, type AiImportFailure, type BatchView } from "@/lib/authoring/aiImportUpload";
import type { RateLimit, RateLimitStore } from "@/lib/rateLimit/store";
import { checkUploadedFile, registerFile, removeFile, type FileRef } from "../files/store";
import { finishExtraction } from "../finish";
import { aiImportAccess, readBatch, type AccessDeps, type BatchRow, type Client } from "./access";
import type { AuthorSession } from "@/lib/authoring/session";
import { readBatchView } from "./state";

/**
 * The work behind AI import's Server Functions (#345). `src/app/author/aiImportActions.ts` wires
 * each to the session and the service client; everything is decided here so it can be tested.
 *
 * Every function checks the caller first (`aiImportAccess`: a teacher, AI import on for the
 * deployment and the workspace), takes the workspace from the session and reads the batch in
 * that workspace only. The `src/lib/aiImport/files` functions take the service-role client, which
 * bypasses RLS, so nothing reaches them before those checks.
 */

export interface ActionDeps extends AccessDeps {
  service: () => Client;
  limiter: () => RateLimitStore;
}

/** Batches a teacher may start in an hour. The database also caps a workspace at 20 open. */
export const AI_IMPORT_BATCH_LIMIT: RateLimit = { attempts: 20, windowMs: 60 * 60 * 1000 };

const failure = (code: string, message: string = messageFor(code)): AiImportFailure => ({
  ok: false,
  code,
  message,
});

type Gate = { author: AuthorSession; service: Client; batch: BatchRow } | AiImportFailure;

/** The caller, and their own workspace's batch. */
async function gate(deps: ActionDeps, batchId: string): Promise<Gate> {
  const access = await aiImportAccess(deps);
  if (access.status === "disabled") return failure("disabled");
  if (access.status !== "ok") return failure(access.status);
  if (!isUuid(batchId)) return failure("not_found");
  const service = deps.service();
  const batch = await readBatch(service, access.author.orgId, batchId);
  if (batch === "unavailable") return failure("unavailable");
  if (!batch) return failure("not_found");
  return { author: access.author, service, batch };
}

export async function startBatch(
  deps: ActionDeps,
  bankId: string,
  rightsConfirmed: boolean,
): Promise<{ ok: true; batchId: string } | AiImportFailure> {
  const access = await aiImportAccess(deps);
  if (access.status === "disabled") return failure("disabled");
  if (access.status !== "ok") return failure(access.status);
  if (!rightsConfirmed) return failure("rights");
  if (!isUuid(bankId)) return failure("not_found");
  const { supabase, orgId, userId } = access.author;

  // The quiz, read under the teacher's RLS: another workspace's quiz is not found.
  const bank = await supabase.from("item_banks").select("id").eq("id", bankId).maybeSingle();
  if (bank.error) return failure("unavailable");
  if (!bank.data) return failure("not_found");

  try {
    if (!(await deps.limiter().hit("ai_import_batch", userId, AI_IMPORT_BATCH_LIMIT))) {
      return failure("rate_limited");
    }
  } catch {
    return failure("unavailable");
  }

  // Made with the teacher's own session: the insert policy checks the workspace has AI import
  // on, and `rights_confirmed_at` and `created_by` are the database's, not the caller's.
  const { data, error } = await supabase
    .from("ai_import_batches")
    .insert({ org_id: orgId, bank_id: bankId })
    .select("id")
    .single();
  if (error || !data) {
    if (error?.code === "23514") return failure("too_many_open");
    if (error?.code === "42501") return failure("disabled");
    console.error("[ai-import] starting a batch failed", { code: error?.code ?? null });
    return failure("unavailable");
  }
  return { ok: true, batchId: data.id };
}

export type Registered =
  | { ok: true; fileId: string; storagePath: string; contentType: string; name: string }
  | AiImportFailure;

export async function registerUpload(
  deps: ActionDeps,
  batchId: string,
  name: string,
): Promise<Registered> {
  const gated = await gate(deps, batchId);
  if ("ok" in gated) return gated;
  if (gated.batch.status !== "uploading") return failure("batch_closed");
  if (typeof name !== "string" || name.length > 1000) return failure("malformed");
  const registered = await registerFile(
    gated.service,
    { orgId: gated.author.orgId, batchId },
    name,
  );
  if (registered.ok) return registered;
  return "reason" in registered
    ? failure(registered.code, registered.reason)
    : failure(registered.code);
}

export type Checked =
  | { ok: true; status: "ready"; pages: number; chunks: number }
  | { ok: true; status: "rejected"; reason: string }
  | AiImportFailure;

function fileRef(gated: { author: AuthorSession }, batchId: string, fileId: string): FileRef {
  return { orgId: gated.author.orgId, batchId, fileId };
}

export async function checkUpload(
  deps: ActionDeps,
  batchId: string,
  fileId: string,
): Promise<Checked> {
  const gated = await gate(deps, batchId);
  if ("ok" in gated) return gated;
  if (!isUuid(fileId)) return failure("not_found");
  const checked = await checkUploadedFile(gated.service, fileRef(gated, batchId, fileId));
  if (!checked.ok) return failure(checked.code);
  if (checked.status === "rejected")
    return { ok: true, status: "rejected", reason: checked.reason };
  return { ok: true, status: "ready", pages: checked.pages, chunks: checked.chunks };
}

export async function removeUpload(
  deps: ActionDeps,
  batchId: string,
  fileId: string,
): Promise<{ ok: true } | AiImportFailure> {
  const gated = await gate(deps, batchId);
  if ("ok" in gated) return gated;
  if (!isUuid(fileId)) return failure("not_found");
  const removed = await removeFile(gated.service, fileRef(gated, batchId, fileId));
  if (removed.ok) return removed;
  return "reason" in removed ? failure(removed.code, removed.reason) : failure(removed.code);
}

/** Closes the batch to new files and starts reading: every file uploaded, at least one ready. */
export async function beginParsing(
  deps: ActionDeps,
  batchId: string,
): Promise<{ ok: true; batch: BatchView } | AiImportFailure> {
  const gated = await gate(deps, batchId);
  if ("ok" in gated) return gated;
  const { service, author } = gated;
  if (gated.batch.status === "uploading") {
    const view = await readBatchView(service, author.orgId, batchId);
    if (view === "unavailable" || view === null) return failure("unavailable");
    if (view.files.some((file) => file.status === "pending")) return failure("pending_files");
    if (!view.files.some((file) => file.status === "ready")) return failure("no_files");
    const { error } = await service
      .from("ai_import_batches")
      .update({ status: "parsing" })
      .eq("id", batchId)
      .eq("org_id", author.orgId)
      .eq("status", "uploading");
    if (error) {
      console.error("[ai-import] starting to read a batch failed", { code: error.code });
      return failure("unavailable");
    }
  } else if (gated.batch.status !== "parsing") {
    return failure("not_parsing");
  }
  const view = await readBatchView(service, author.orgId, batchId);
  if (view === "unavailable" || view === null) return failure("unavailable");
  return { ok: true, batch: view };
}

/**
 * After the page has extracted every unit of every file: duplicates flagged and the source matter
 * recorded (`finishExtraction`), then the batch moves to review. Refused while any chunk is
 * unread. Running it again on a batch in review changes nothing.
 */
export async function finishBatch(
  deps: ActionDeps,
  batchId: string,
): Promise<{ ok: true } | AiImportFailure> {
  const gated = await gate(deps, batchId);
  if ("ok" in gated) return gated;
  const { service, author } = gated;
  if (gated.batch.status === "review") return { ok: true };
  if (gated.batch.status !== "parsing") return failure("not_parsing");

  const unread = await service
    .from("ai_import_chunks")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .eq("org_id", author.orgId)
    .neq("status", "done");
  if (unread.error) return failure("unavailable");
  if ((unread.count ?? 0) > 0) return failure("incomplete");

  const finished = await finishExtraction(service, { orgId: author.orgId, batchId });
  if (!finished.ok) return failure(finished.code);
  const { error } = await service
    .from("ai_import_batches")
    .update({ status: "review" })
    .eq("id", batchId)
    .eq("org_id", author.orgId)
    .eq("status", "parsing");
  if (error) {
    console.error("[ai-import] moving a batch to review failed", { code: error.code });
    return failure("unavailable");
  }
  return { ok: true };
}
