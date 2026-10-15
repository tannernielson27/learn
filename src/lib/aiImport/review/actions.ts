import { z } from "zod";
import { messageFor, type AiImportFailure } from "@/lib/authoring/aiImportUpload";
import { restoredStatus, type ReviewStatus } from "@/lib/authoring/aiImportReview";
import { aiImportAccess, type AccessDeps, type Client } from "../upload/access";
import { ENTRY_COLUMNS, toEntryView, type EntryRow } from "./read";

/**
 * Drop and restore on the review screen (#346). Each Server Function checks the caller itself: a
 * teacher, AI import on, and the workspace from the session. The read and the write run with the
 * teacher's own session, so RLS applies too ("authors edit AI import entries" lets a teacher change
 * an entry only while its batch is in review), and both are filtered by the session's workspace.
 *
 * The version check: the page says which version of the entry it showed, and the update names it
 * (`where version = …`; a trigger bumps it on every update). An entry another tab changed is
 * refused with `entry_changed`, never overwritten.
 */

export type ReviewActionDeps = AccessDeps;

export type EntryActionResult =
  { ok: true; version: number; status: ReviewStatus } | AiImportFailure;

const inputSchema = z.object({
  batchId: z.uuid(),
  entryId: z.uuid(),
  version: z.number().int().min(1).max(2_147_483_647),
});

export type EntryActionInput = z.infer<typeof inputSchema>;

const refuse = (code: string): AiImportFailure => ({ ok: false, code, message: messageFor(code) });

const logged = (step: string, error: { code?: string } | null) => {
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

/** The entry and its batch's status, read with the teacher's own session. */
async function readEntry(
  client: Client,
  orgId: string,
  input: EntryActionInput,
): Promise<{ row: EntryRow; batchStatus: string } | "not_found" | "unavailable"> {
  const [entry, batch] = await Promise.all([
    client
      .from("ai_import_entries")
      .select(ENTRY_COLUMNS)
      .eq("id", input.entryId)
      .eq("batch_id", input.batchId)
      .eq("org_id", orgId)
      .maybeSingle(),
    client
      .from("ai_import_batches")
      .select("status")
      .eq("id", input.batchId)
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);
  const error = entry.error ?? batch.error;
  if (error) {
    logged("reading an entry", error);
    return "unavailable";
  }
  if (!entry.data || !batch.data) return "not_found";
  return { row: entry.data as EntryRow, batchStatus: batch.data.status };
}

/**
 * The shared path: who, what, which version, then `next` decides the new status (or null to leave
 * the entry as it is).
 */
async function setStatus(
  deps: ReviewActionDeps,
  raw: unknown,
  next: (row: EntryRow) => ReviewStatus | null,
): Promise<EntryActionResult> {
  const access = await aiImportAccess(deps);
  if (access.status === "signed_out") return refuse("signed_out");
  if (access.status === "forbidden") return refuse("forbidden");
  if (access.status === "disabled") return refuse("not_found");
  if (access.status === "unavailable") return refuse("unavailable");
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return refuse("malformed");
  const input = parsed.data;
  const { supabase, orgId } = access.author;
  const client = supabase as unknown as Client;

  const read = await readEntry(client, orgId, input);
  if (read === "unavailable" || read === "not_found") return refuse(read);
  if (read.batchStatus !== "review") return refuse("not_review");
  if (read.row.version !== input.version) return refuse("entry_changed");
  const status = next(read.row);
  if (status === null) {
    return { ok: true, version: read.row.version, status: toEntryView(read.row).status };
  }

  const { data, error } = await client
    .from("ai_import_entries")
    .update({ status })
    .eq("id", input.entryId)
    .eq("batch_id", input.batchId)
    .eq("org_id", orgId)
    .eq("version", input.version)
    .select("version, status");
  if (error) {
    logged("changing an entry", error);
    return refuse("unavailable");
  }
  const [written] = data ?? [];
  // No row: another tab moved the version on (or the batch left review) since the read.
  if (!written) return refuse("entry_changed");
  return { ok: true, version: written.version, status: written.status as ReviewStatus };
}

/** Drops an entry from the import. It stays in the batch, and can be restored. */
export function dropEntry(deps: ReviewActionDeps, input: unknown): Promise<EntryActionResult> {
  return setStatus(deps, input, (row) => (row.status === "dropped" ? null : "dropped"));
}

/** Brings a dropped entry back, with the status its type, item and reasons give it. */
export function restoreEntry(deps: ReviewActionDeps, input: unknown): Promise<EntryActionResult> {
  return setStatus(deps, input, (row) =>
    row.status === "dropped" ? restoredStatus(toEntryView(row)) : null,
  );
}
