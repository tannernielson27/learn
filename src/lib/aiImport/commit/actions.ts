import { z } from "zod";
import { messageFor, type AiImportFailure } from "@/lib/authoring/aiImportUpload";
import type { AuthorSession } from "@/lib/authoring/session";
import type { Json } from "@/lib/supabase/database.types";
import { AI_IMPORT_BUCKET } from "../files/store";
import { aiImportAccess, type AccessDeps, type Client } from "../upload/access";
import { COMMIT_ENTRY_COLUMNS, planCommit, type CommitEntryRow } from "./plan";

/**
 * Import a reviewed batch into its quiz, or discard it (#348). Each Server Function checks the
 * caller itself (a teacher, AI import on, the workspace from the session). The reads, the import
 * call and the discard run with the teacher's own session, so RLS and `import_ai_batch`'s own
 * checks apply as well. The service client is used for one thing only, after that: removing the
 * batch's uploaded files from Storage, filtered by the session's workspace.
 *
 * Owner decision, 2026-10-15: the questions land in the quiz the import was started from
 * (`ai_import_batches.bank_id`); no new quiz is made.
 */

export interface CommitDeps extends AccessDeps {
  service: () => Client;
}

export type ImportResult =
  { ok: true; questions: number; caseStudies: number; bankId: string } | AiImportFailure;

export type DiscardResult = { ok: true; bankId: string | null } | AiImportFailure;

/** A batch that is still open; an imported batch is final. */
const OPEN = ["uploading", "parsing", "review", "failed"];

/** How many queued objects one request removes; the rest wait for the next. */
const DRAIN_LIMIT = 100;

const inputSchema = z.object({ batchId: z.uuid() });

const refuse = (code: string): AiImportFailure => ({ ok: false, code, message: messageFor(code) });

const logged = (step: string, error: { code?: string; message?: string } | null) => {
  // The code and nothing else: never an entry, which holds the document's words and keys.
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

type Checked = { author: AuthorSession; client: Client; batchId: string } | AiImportFailure;

async function check(deps: AccessDeps, raw: unknown): Promise<Checked> {
  const access = await aiImportAccess(deps);
  if (access.status === "disabled") return refuse("not_found");
  if (access.status !== "ok") return refuse(access.status);
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return refuse("malformed");
  return {
    author: access.author,
    client: access.author.supabase as unknown as Client,
    batchId: parsed.data.batchId,
  };
}

async function readBatch(
  client: Client,
  orgId: string,
  batchId: string,
): Promise<{ status: string; bankId: string | null } | "not_found" | "unavailable"> {
  const { data, error } = await client
    .from("ai_import_batches")
    .select("status, bank_id")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) {
    logged("reading a batch", error);
    return "unavailable";
  }
  if (!data) return "not_found";
  return { status: data.status, bankId: data.bank_id };
}

/**
 * Removes the workspace's queued Storage objects (`ai_import_object_deletes`, filled by the
 * database when a file row goes), then their queue rows. A removal that fails leaves them queued
 * for the workspace's next import or discard; the import or discard itself has already happened.
 */
export async function removeQueuedFiles(service: Client, orgId: string): Promise<void> {
  const { data, error } = await service
    .from("ai_import_object_deletes")
    .select("storage_path")
    .eq("org_id", orgId)
    .order("queued_at")
    .limit(DRAIN_LIMIT);
  if (error) {
    logged("reading the files to remove", error);
    return;
  }
  const paths = (data ?? []).map((row) => row.storage_path);
  if (paths.length === 0) return;
  const removed = await service.storage.from(AI_IMPORT_BUCKET).remove(paths);
  if (removed.error) {
    logged("removing uploaded files", removed.error as { message?: string });
    return;
  }
  const { error: forgetError } = await service
    .from("ai_import_object_deletes")
    .delete()
    .eq("org_id", orgId)
    .in("storage_path", paths);
  if (forgetError) logged("clearing removed files", forgetError);
}

/** Every kept question and case study of the batch, into its quiz as drafts, all or nothing. */
export async function importBatch(deps: CommitDeps, raw: unknown): Promise<ImportResult> {
  const checked = await check(deps, raw);
  if ("ok" in checked) return checked;
  const { author, client, batchId } = checked;

  const batch = await readBatch(client, author.orgId, batchId);
  if (typeof batch === "string") return refuse(batch);
  if (batch.status === "imported") return refuse("already_imported");
  if (batch.status !== "review") return refuse("not_review");
  if (!batch.bankId) return refuse("quiz_gone");

  const { data: rows, error } = await client
    .from("ai_import_entries")
    .select(COMMIT_ENTRY_COLUMNS)
    .eq("batch_id", batchId)
    .eq("org_id", author.orgId)
    .order("position");
  if (error) {
    logged("reading entries to import", error);
    return refuse("unavailable");
  }
  const plan = planCommit((rows ?? []) as CommitEntryRow[]);
  if (!plan.ok) return refuse(plan.code);

  const { data, error: importError } = await client.rpc("import_ai_batch", {
    p_batch: batchId,
    p_entries: plan.entries as unknown as Json,
  });
  if (importError) {
    if (importError.code === "54000") return refuse("import_limited");
    logged("importing a batch", importError);
    return refuse("unavailable");
  }
  const result = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    questions?: number;
    case_studies?: number;
  };
  if (result.ok !== true) return refuse(result.reason ?? "unavailable");

  await removeQueuedFiles(deps.service(), author.orgId);
  return {
    ok: true,
    questions: result.questions ?? 0,
    caseStudies: result.case_studies ?? 0,
    bankId: batch.bankId,
  };
}

/** Deletes an open batch: its entries and files go with it, and its uploads are removed. */
export async function discardBatch(deps: CommitDeps, raw: unknown): Promise<DiscardResult> {
  const checked = await check(deps, raw);
  if ("ok" in checked) return checked;
  const { author, client, batchId } = checked;

  const batch = await readBatch(client, author.orgId, batchId);
  if (typeof batch === "string") return refuse(batch);
  if (batch.status === "imported") return refuse("already_imported");

  const { data, error } = await client
    .from("ai_import_batches")
    .delete()
    .eq("id", batchId)
    .eq("org_id", author.orgId)
    .in("status", OPEN)
    .select("id");
  if (error) {
    logged("discarding a batch", error);
    return refuse("unavailable");
  }
  // No row: another tab imported or discarded it since the read.
  if (!data || data.length === 0) return refuse("not_found");

  await removeQueuedFiles(deps.service(), author.orgId);
  return { ok: true, bankId: batch.bankId };
}
