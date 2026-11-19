import { z } from "zod";
import { messageFor, type AiImportFailure } from "@/lib/authoring/aiImportUpload";
import { restoredStatus, type ReviewStatus } from "@/lib/authoring/aiImportReview";
import { refreshBatchDuplicates } from "../duplicates";
import { aiImportAccess, type AccessDeps, type Client } from "../upload/access";
import { reviewAllowance, type ReviewLimitDeps } from "./limit";
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
 *
 * After a drop or a restore the batch's own duplicate flags are worked out again (#593): the
 * later copy of a dropped question is no longer a duplicate. Only the service client may write
 * `reasons`, so that one step is its; it is told the session's workspace and the batch just
 * checked, and nothing from the request.
 */

export interface ReviewActionDeps extends AccessDeps, ReviewLimitDeps {
  /** For the duplicate flags only. Without it they are left as they were. */
  service?: () => Client;
}

/**
 * The batch's duplicate flags again, and the version each rewritten entry now has. A failure is
 * logged by the pass and changes nothing else: the drop or restore itself has happened.
 */
async function reflag(
  deps: ReviewActionDeps,
  orgId: string,
  batchId: string,
): Promise<ReadonlyMap<string, number>> {
  if (!deps.service) return new Map();
  const refreshed = await refreshBatchDuplicates(deps.service(), { orgId, batchId });
  return refreshed.ok ? refreshed.versions : new Map();
}

/** Another entry the duplicate pass rewrote, and the version it now has. */
export interface ChangedVersion {
  id: string;
  version: number;
}

export type EntryActionResult =
  | {
      ok: true;
      version: number;
      status: ReviewStatus;
      /**
       * #593: the other entries whose duplicate flag changed with this one. The page showed each
       * at an older version, and would be refused on its next change without the new one.
       */
      changed?: ChangedVersion[];
    }
  | AiImportFailure;

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
export async function readEntry(
  client: Client,
  orgId: string,
  input: Pick<EntryActionInput, "batchId" | "entryId">,
  /** A caller that needs the model's draft as well asks for it; nothing else does. */
  columns: string = ENTRY_COLUMNS,
): Promise<{ row: EntryRow; batchStatus: string } | "not_found" | "unavailable"> {
  const [entry, batch] = await Promise.all([
    client
      .from("ai_import_entries")
      .select(columns)
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
  return { row: entry.data as unknown as EntryRow, batchStatus: batch.data.status };
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
  const allowed = await reviewAllowance(deps, access.author.userId);
  if (allowed !== "ok") return refuse(allowed);
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
  const versions = await reflag(deps, orgId, input.batchId);
  const changed = othersIn(versions, [input.entryId]);
  return {
    ok: true,
    // A restored question that is now flagged was written once more, so its version moved on.
    version: versions.get(input.entryId) ?? written.version,
    status: written.status as ReviewStatus,
    ...(changed.length > 0 ? { changed } : {}),
  };
}

/** The rewritten entries other than the ones the request itself changed. */
const othersIn = (
  versions: ReadonlyMap<string, number>,
  own: readonly string[],
): ChangedVersion[] =>
  [...versions].filter(([id]) => !own.includes(id)).map(([id, version]) => ({ id, version }));

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

const bulkSchema = z.object({
  batchId: z.uuid(),
  entries: z
    .array(z.object({ entryId: z.uuid(), version: z.number().int().min(1).max(2_147_483_647) }))
    .min(1)
    .max(150),
});

export type BulkDropResult =
  | {
      ok: true;
      /** The entries that were dropped, each at its new version. */
      dropped: { id: string; version: number }[];
      /** How many were left alone: changed in another tab, or no longer needing attention. */
      left: number;
      /** Other entries whose duplicate flag changed, as a single drop reports them. */
      changed?: ChangedVersion[];
    }
  // A write that fails part of the way through says what it had already dropped, so the page
  // does not go on showing those cards at versions that no longer stand.
  | (AiImportFailure & { dropped?: ChangedVersion[]; changed?: ChangedVersion[] });

/**
 * How many entries one update names. A full batch in one request line would be about 9,000
 * characters, past the 8,000 a proxy in front of the Data API commonly allows, so the list is
 * sent in parts.
 */
const BULK_CHUNK = 30;

const NEEDS_ATTENTION: ReviewStatus[] = ["needs_answer", "needs_fix"];

/**
 * "Drop the N that need attention" (#593): one request for every entry the page listed as needing
 * an answer or a fix. Each is dropped only where it is still at the version the page showed and
 * still needs attention, so a question fixed in another tab meanwhile is left as it is and
 * counted in `left`. The writes are the teacher's own session's, as a single drop's is.
 */
export async function dropEntries(deps: ReviewActionDeps, raw: unknown): Promise<BulkDropResult> {
  const access = await aiImportAccess(deps);
  if (access.status === "disabled") return refuse("not_found");
  if (access.status !== "ok") return refuse(access.status);
  const parsed = bulkSchema.safeParse(raw);
  if (!parsed.success) return refuse("malformed");
  const { batchId, entries } = parsed.data;
  const allowed = await reviewAllowance(deps, access.author.userId);
  if (allowed !== "ok") return refuse(allowed);
  const { supabase, orgId } = access.author;
  const client = supabase as unknown as Client;

  const batch = await client
    .from("ai_import_batches")
    .select("status")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (batch.error) {
    logged("reading a batch", batch.error);
    return refuse("unavailable");
  }
  if (!batch.data) return refuse("not_found");
  if (batch.data.status !== "review") return refuse("not_review");

  const dropped: { id: string; version: number }[] = [];
  let failed = false;
  for (let start = 0; start < entries.length; start += BULK_CHUNK) {
    // Each id is a UUID and each version a whole number (checked above), so the filter holds
    // nothing a caller wrote freely.
    const shown = entries
      .slice(start, start + BULK_CHUNK)
      .map((entry) => `and(id.eq.${entry.entryId},version.eq.${entry.version})`)
      .join(",");
    const { data, error } = await client
      .from("ai_import_entries")
      .update({ status: "dropped" })
      .eq("batch_id", batchId)
      .eq("org_id", orgId)
      .in("status", NEEDS_ATTENTION)
      .or(shown)
      .select("id, version");
    if (error) {
      logged("dropping entries", error);
      failed = true;
      break;
    }
    dropped.push(...((data ?? []) as { id: string; version: number }[]));
  }
  const versions = dropped.length > 0 ? await reflag(deps, orgId, batchId) : new Map();
  const changed = othersIn(
    versions,
    dropped.map((row) => row.id),
  );
  const moved = { dropped, ...(changed.length > 0 ? { changed } : {}) };
  if (failed) {
    // An earlier part's entries stay dropped, and the answer names them with the failure.
    return {
      ...refuse("unavailable"),
      ...(dropped.length > 0
        ? { message: `Dropped ${dropped.length}, then it stopped working. Try again for the rest.` }
        : {}),
      ...moved,
    };
  }
  return { ok: true, ...moved, left: entries.length - dropped.length };
}
