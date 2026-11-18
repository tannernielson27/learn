import { z } from "zod";
import { messageFor, type AiImportFailure } from "@/lib/authoring/aiImportUpload";
import type { Json } from "@/lib/supabase/database.types";
import { MAX_ENTRIES_PER_BATCH } from "../config";
import { refreshBatchDuplicates } from "../duplicates";
import { placeOf, removedPlaces } from "../places";
import { aiImportAccess, type AccessDeps, type Client } from "../upload/access";
import { placeSteps, splitSteps, type SplitStep } from "./caseStudy";
import { ENTRY_COLUMNS, type EntryRow } from "./read";

/**
 * Split a staged case study into six separate questions (#593, owner decision 2026-11-17): the
 * way out for a case study whose patient record could not be built, when the teacher wants its
 * questions anyway. Each step becomes a staged question with the status it would have had on its
 * own, and says that the patient record was not attached.
 *
 * Who and what, in order: a teacher, AI import on, the workspace from the session; the entry and
 * everything about its batch read with the teacher's own session (RLS), a case study that has not
 * been dropped, at the version the page showed, in a batch in review, with room under the batch's
 * 150 entries. A teacher's session may not insert an entry, so the write is the service client's,
 * after the batch is read again: steps 2 to 6 are inserted first, then the case study's own row
 * becomes step 1 where it is still at that version. If that last write finds the row changed, the
 * five new rows are taken out again and nothing has happened.
 *
 * Nothing in the request is trusted beyond its three ids and the version: every question is built
 * here, from the stored entry.
 */

export interface SplitDeps extends AccessDeps {
  service: () => Client;
}

export type SplitResult = { ok: true; questions: number } | AiImportFailure;

const SPLIT_MESSAGES = {
  not_splittable: "Only a case study that has not been dropped can be split.",
  cannot_split: "This case study cannot be split into separate questions. Drop it instead.",
  split_too_many:
    "An import holds at most 150 questions, and splitting this case study would pass that. Drop it instead.",
} as const;

const refuse = (code: string): AiImportFailure => ({
  ok: false,
  code,
  message: SPLIT_MESSAGES[code as keyof typeof SPLIT_MESSAGES] || messageFor(code),
});

const logged = (step: string, error: { code?: string } | null) => {
  // The code and nothing else: never an entry, which holds the document's words and keys.
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

const inputSchema = z.object({
  batchId: z.uuid(),
  entryId: z.uuid(),
  version: z.number().int().min(1).max(2_147_483_647),
});

type SplitRow = EntryRow & { draft: unknown };

interface Read {
  row: SplitRow;
  batchStatus: string;
  /** Every place taken in the batch, removed files' included: the unique index counts them all. */
  taken: Set<number>;
  removed: ReadonlySet<number>;
  pdf: boolean;
}

async function readForSplit(
  client: Client,
  orgId: string,
  input: z.infer<typeof inputSchema>,
): Promise<Read | "not_found" | "unavailable"> {
  const [entry, batch, places, files] = await Promise.all([
    client
      .from("ai_import_entries")
      .select(`${ENTRY_COLUMNS}, draft`)
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
    client
      .from("ai_import_entries")
      .select("position")
      .eq("batch_id", input.batchId)
      .eq("org_id", orgId),
    client
      .from("ai_import_files")
      .select("status, rejected_reason")
      .eq("batch_id", input.batchId)
      .eq("org_id", orgId)
      .order("created_at")
      .order("id"),
  ]);
  const error = entry.error ?? batch.error ?? places.error ?? files.error;
  if (error) {
    logged("reading a case study to split", error);
    return "unavailable";
  }
  const row = entry.data as SplitRow | null;
  if (!row || !batch.data) return "not_found";
  let pdf = false;
  if (row.chunk_id) {
    // A chunk of a PDF has pages; a chunk of text has none.
    const chunk = await client
      .from("ai_import_chunks")
      .select("page_from")
      .eq("id", row.chunk_id)
      .eq("batch_id", input.batchId)
      .eq("org_id", orgId)
      .maybeSingle();
    if (chunk.error) {
      logged("reading a case study's chunk", chunk.error);
      return "unavailable";
    }
    pdf = chunk.data?.page_from !== null && chunk.data?.page_from !== undefined;
  }
  return {
    row,
    batchStatus: batch.data.status,
    taken: new Set(((places.data ?? []) as { position: number }[]).map((r) => r.position)),
    removed: removedPlaces(files.data ?? []),
    pdf,
  };
}

const jsonOf = (value: unknown): Json | null =>
  value === null || value === undefined ? null : (JSON.parse(JSON.stringify(value)) as Json);

/** What a step writes, whichever row it lands in. */
const columnsOf = (step: SplitStep, title: string) => ({
  kind: "item",
  type: step.type,
  status: step.status,
  reasons: step.reasons,
  draft: jsonOf(step.draft),
  item: jsonOf(step.item),
  group_key: title.slice(0, 80) || null,
  step: step.step,
});

export async function splitCaseStudy(deps: SplitDeps, raw: unknown): Promise<SplitResult> {
  const access = await aiImportAccess(deps);
  if (access.status === "disabled") return refuse("not_found");
  if (access.status !== "ok") return refuse(access.status);
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return refuse("malformed");
  const input = parsed.data;
  const { supabase, orgId } = access.author;

  const read = await readForSplit(supabase as unknown as Client, orgId, input);
  if (typeof read === "string") return refuse(read);
  const { row } = read;
  // An entry at a removed file's place is not part of the import (#591), so it is not there.
  if (read.removed.has(placeOf(row.position))) return refuse("not_found");
  if (read.batchStatus !== "review") return refuse("not_review");
  if (row.kind !== "case_study" || row.status === "dropped") return refuse("not_splittable");
  if (row.version !== input.version) return refuse("entry_changed");
  if (read.taken.size + 5 > MAX_ENTRIES_PER_BATCH) return refuse("split_too_many");

  const title = row.group_key ?? "Untitled";
  const steps = splitSteps({
    item: row.item,
    draft: row.draft,
    reasons: row.reasons ?? [],
    title,
    pdf: read.pdf,
  });
  const places = placeSteps(row.position, read.taken);
  if (!steps || !places) return refuse("cannot_split");
  const [first, ...rest] = steps as [SplitStep, ...SplitStep[]];

  // The service client is not held to "only while in review", so the batch is read again here,
  // as a save's is (`saveEntryFix`).
  const service = deps.service();
  const open = await service
    .from("ai_import_batches")
    .select("status")
    .eq("id", input.batchId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (open.error) {
    logged("reading a batch", open.error);
    return refuse("unavailable");
  }
  if (open.data?.status !== "review") return refuse("not_review");

  const inserted = await service
    .from("ai_import_entries")
    .insert(
      rest.map((step, index) => ({
        ...columnsOf(step, title),
        batch_id: input.batchId,
        org_id: orgId,
        chunk_id: row.chunk_id ?? null,
        position: places[index]!,
        source_excerpt: row.source_excerpt,
      })),
    )
    .select("id");
  if (inserted.error) {
    logged("splitting a case study", inserted.error);
    return refuse("unavailable");
  }
  const newIds = ((inserted.data ?? []) as { id: string }[]).map((r) => r.id);

  const lead = await service
    .from("ai_import_entries")
    .update(columnsOf(first, title))
    .eq("id", input.entryId)
    .eq("batch_id", input.batchId)
    .eq("org_id", orgId)
    .eq("version", input.version)
    .select("version");
  if (lead.error || (lead.data ?? []).length === 0) {
    // The case study changed (or the write failed) after its steps went in: take them out again.
    const undone = await service
      .from("ai_import_entries")
      .delete()
      .eq("batch_id", input.batchId)
      .eq("org_id", orgId)
      .in("id", newIds);
    if (undone.error) logged("undoing a split", undone.error);
    if (lead.error) logged("splitting a case study", lead.error);
    return refuse(lead.error ? "unavailable" : "entry_changed");
  }

  // Six questions now stand where one case study did; a failed flag pass leaves them unflagged.
  await refreshBatchDuplicates(service, { orgId, batchId: input.batchId });
  return { ok: true, questions: steps.length };
}
