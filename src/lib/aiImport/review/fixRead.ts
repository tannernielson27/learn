import {
  caseSteps,
  stepOfReason,
  stepType,
  stepsNeedingAttention,
} from "@/lib/authoring/aiImportCaseStudy";
import {
  needsAttention,
  readStoredReasons,
  type ReviewReason,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import type { BatchStatus } from "@/lib/authoring/aiImportUpload";
import type { ItemType } from "@/lib/ngn/labels";
import { ehrRecordSchema, type EhrRecord } from "@/lib/ngn/schemas";
import { placeOf, removedPlaces, withoutRemoved } from "../places";
import type { Client } from "../upload/access";
import { editorStart, isItemType } from "./fix";
import { ENTRY_COLUMNS, chunkPages, toEntryView, type EntryRow } from "./read";

/**
 * What the edit page shows of one staged question, or of one step of a staged case study (#347,
 * #593). Read with the teacher's own session (RLS) and filtered by the session's workspace and
 * the quiz in the address. The model's draft opens the editor and goes no further.
 *
 * It also says where "Save and go to the next one" leads: the next question, or case study step,
 * that still needs an answer or a fix, in the order the review lists them.
 */

/** Something the teacher can open and fix: a question, or one step of a case study. */
export interface FixTarget {
  entryId: string;
  /** From 1, for a case study's step. */
  step?: number;
}

export interface FixEntry {
  id: string;
  version: number;
  type: ItemType;
  status: ReviewStatus;
  reasons: ReviewReason[];
  sourceExcerpt: string;
  sourcePages: { from: number; to: number } | null;
  /** The file it came from, as the teacher named it. */
  fileName: string | null;
  /** Its number on the review screen: its place in source order across the import, from 1. */
  number: number;
  /** The stored item JSON the editor opens on (`editorStart`, or the step's own question). */
  start: unknown;
  /** Set when this is one step of a case study. */
  caseStudy: { title: string; step: number; record: EhrRecord | null } | null;
  next: FixTarget | null;
}

const logged = (step: string, error: { code?: string } | null) => {
  // The code and nothing else: never an entry, which holds the document's words and keys.
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

interface Light {
  id: string;
  position: number;
  kind: string;
  type: string | null;
  status: string;
}

type Placed = FixTarget & { position: number };

/**
 * Everything that still needs the teacher, in review order: each question that needs an answer or
 * a fix and has an editor, and each step of a case study that does (`stepsNeedingAttention`).
 */
export function attentionTargets(
  entries: readonly Light[],
  cases: ReadonlyMap<string, { item: unknown; reasons: readonly string[] }>,
): Placed[] {
  return [...entries]
    .sort((a, b) => a.position - b.position)
    .filter((entry) => needsAttention({ status: entry.status as ReviewStatus }))
    .flatMap((entry): Placed[] => {
      if (entry.kind !== "case_study") {
        return isItemType(entry.type) ? [{ entryId: entry.id, position: entry.position }] : [];
      }
      const stored = cases.get(entry.id);
      if (!stored) return [];
      return stepsNeedingAttention({
        item: stored.item,
        reasons: readStoredReasons(stored.reasons),
      }).map(({ step }) => ({ entryId: entry.id, step, position: entry.position }));
    });
}

/** The target after `current`, going round to the start; null when nothing else needs attention. */
export function nextTarget(targets: readonly Placed[], current: Placed): FixTarget | null {
  const same = (target: Placed) =>
    target.entryId === current.entryId && target.step === current.step;
  const others = targets.filter((target) => !same(target));
  const after = (target: Placed) =>
    target.position > current.position ||
    (target.position === current.position && (target.step ?? 0) > (current.step ?? 0));
  const found = others.find(after) ?? others[0];
  return found
    ? { entryId: found.entryId, ...(found.step !== undefined ? { step: found.step } : {}) }
    : null;
}

type FullRow = EntryRow & { draft: unknown };

/** The question the editor opens on, with what the page says about it; null when there is none. */
function editable(
  row: FullRow,
  step: number | undefined,
): Pick<FixEntry, "type" | "reasons" | "start" | "caseStudy"> | null {
  if (row.status === "dropped") return null;
  const reasons = readStoredReasons(row.reasons ?? []);
  if (step === undefined) {
    if (row.kind !== "item" || !isItemType(row.type)) return null;
    return {
      type: row.type,
      reasons,
      start: editorStart({ item: row.item, draft: row.draft, reasons: row.reasons ?? [] }),
      caseStudy: null,
    };
  }
  const question = row.kind === "case_study" ? caseSteps(row.item)?.[step - 1] : undefined;
  const type = question ? stepType(question) : null;
  if (!question || type === null) return null;
  const record = ehrRecordSchema.safeParse((row.item as { ehr?: unknown }).ehr);
  return {
    type,
    // The step's own reasons, without "Step 3: " in front: the heading says which step this is.
    reasons: reasons.flatMap((reason) => {
      const about = stepOfReason(reason.message);
      return about.step === step ? [{ code: reason.code, message: about.message }] : [];
    }),
    start: question,
    caseStudy: {
      title: row.group_key ?? "Untitled",
      step,
      record: record.success ? record.data : null,
    },
  };
}

/**
 * One question of a batch of this workspace and quiz, for its edit page; null when there is no
 * such batch, and no entry when it is not one a teacher can edit here.
 */
export async function readFixEntry(
  client: Client,
  orgId: string,
  ids: { bankId: string; batchId: string; entryId: string; step?: number },
): Promise<{ batchStatus: BatchStatus; entry: FixEntry | null } | null | "unavailable"> {
  const [batch, entry, order, files] = await Promise.all([
    client
      .from("ai_import_batches")
      .select("status")
      .eq("id", ids.batchId)
      .eq("org_id", orgId)
      .eq("bank_id", ids.bankId)
      .maybeSingle(),
    client
      .from("ai_import_entries")
      .select(`${ENTRY_COLUMNS}, draft`)
      .eq("id", ids.entryId)
      .eq("batch_id", ids.batchId)
      .eq("org_id", orgId)
      .maybeSingle(),
    client
      .from("ai_import_entries")
      .select("id, position, kind, type, status")
      .eq("batch_id", ids.batchId)
      .eq("org_id", orgId)
      .order("position"),
    client
      .from("ai_import_files")
      .select("original_name, status, rejected_reason")
      .eq("batch_id", ids.batchId)
      .eq("org_id", orgId)
      .order("created_at")
      .order("id"),
  ]);
  const error = batch.error ?? entry.error ?? order.error ?? files.error;
  if (error) {
    logged("reading an entry to fix", error);
    return "unavailable";
  }
  if (!batch.data) return null;
  const batchStatus = batch.data.status as BatchStatus;
  const row = entry.data as FullRow | null;
  const fileRows = files.data ?? [];
  const removed = removedPlaces(fileRows);
  const opened = row && !removed.has(placeOf(row.position)) ? editable(row, ids.step) : null;
  if (!row || !opened) return { batchStatus, entry: null };

  const listed = withoutRemoved((order.data ?? []) as Light[], removed);
  const extra = await readExtras(client, orgId, ids.batchId, row, listed);
  if (extra === "unavailable") return "unavailable";
  const view = toEntryView(row, extra.pages);
  const current = { entryId: row.id, position: row.position, step: ids.step };
  return {
    batchStatus,
    entry: {
      id: row.id,
      version: row.version,
      status: view.status,
      sourceExcerpt: row.source_excerpt,
      sourcePages: view.sourcePages ?? null,
      fileName: fileRows[placeOf(row.position)]?.original_name ?? null,
      number: listed.findIndex((other) => other.id === row.id) + 1,
      next: nextTarget(attentionTargets(listed, extra.cases), current),
      ...opened,
    },
  };
}

/**
 * The two reads that depend on the first ones: the pages of the entry's chunk (a PDF's), and the
 * case studies that still need attention, whose steps "next" may lead to.
 */
async function readExtras(
  client: Client,
  orgId: string,
  batchId: string,
  row: FullRow,
  listed: readonly Light[],
) {
  const waiting = listed
    .filter(
      (entry) =>
        entry.kind === "case_study" && needsAttention({ status: entry.status as ReviewStatus }),
    )
    .map((entry) => entry.id);
  const [chunk, cases] = await Promise.all([
    row.chunk_id
      ? client
          .from("ai_import_chunks")
          .select("id, page_from, page_to")
          .eq("id", row.chunk_id)
          .eq("batch_id", batchId)
          .eq("org_id", orgId)
      : null,
    waiting.length > 0
      ? client
          .from("ai_import_entries")
          .select("id, item, reasons")
          .eq("batch_id", batchId)
          .eq("org_id", orgId)
          .in("id", waiting)
      : null,
  ]);
  const error = chunk?.error ?? cases?.error;
  if (error) {
    logged("reading an entry's source", error);
    return "unavailable" as const;
  }
  type Chunk = { id: string; page_from: number | null; page_to: number | null };
  const pages = chunkPages((chunk?.data ?? []) as Chunk[]);
  type Case = { id: string; item: unknown; reasons: string[] | null };
  return {
    pages,
    cases: new Map(
      ((cases?.data ?? []) as Case[]).map((c) => [
        c.id,
        { item: c.item, reasons: c.reasons ?? [] },
      ]),
    ),
  };
}
