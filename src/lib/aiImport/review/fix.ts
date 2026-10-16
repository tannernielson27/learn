import { z } from "zod";
import { inputFromForm } from "@/lib/authoring/forms/codecs";
import {
  readStoredReasons,
  restoredStatus,
  type ReviewReason,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import { messageFor, type AiImportFailure, type BatchStatus } from "@/lib/authoring/aiImportUpload";
import { withinItemSizeLimit } from "@/lib/authoring/payloadSize";
import { ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import { itemQualityWarnings } from "@/lib/ngn/quality";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import type { Json } from "@/lib/supabase/database.types";
import { convertDraft, formatReason, MAX_REASONS, readReason } from "../stage";
import { aiImportAccess, type AccessDeps, type Client } from "../upload/access";
import { readEntry } from "./actions";
import { ENTRY_COLUMNS, toEntryView, type EntryRow } from "./read";

/**
 * Fix a staged question with its type's own editor (#347). The editor opens on what was staged
 * (`editorStart`), and its Save sends the form here. The form is read back exactly as the item
 * page's Save draft reads it (`inputFromForm`), then it must be a whole, valid item of the
 * entry's type: a staged entry holds a valid item or none, so #348 imports only what passed.
 *
 * Who and what, in order: a teacher, AI import on, the workspace from the session; the entry, of
 * this workspace and batch, read with the teacher's own session (RLS), a single question with an
 * NGN type that has not been dropped, at the version the page showed, in a batch in review. The
 * reasons change too, which only the service client may write, so the batch is read again just
 * before the write, and the write names the workspace, the batch, the entry and the version.
 */

export interface FixDeps extends AccessDeps {
  service: () => Client;
}

export type FixResult = { ok: true; version: number; status: ReviewStatus } | AiImportFailure;

const FIX_MESSAGES = {
  not_editable:
    "Only a single question with an NGN type that has not been dropped can be edited here.",
  not_complete:
    "This question is not complete yet. Fix the problems listed under the question, then save.",
  too_large: "This question is too large to save. Shorten the longest text, or split it in two.",
} as const;

const refuse = (code: string, message?: string): AiImportFailure => ({
  ok: false,
  code,
  message: message ?? (FIX_MESSAGES[code as keyof typeof FIX_MESSAGES] || messageFor(code)),
});

const logged = (step: string, error: { code?: string } | null) => {
  // The code and nothing else: never an entry, which holds the document's words and keys.
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

const inputSchema = z.object({
  batchId: z.uuid(),
  entryId: z.uuid(),
  version: z.number().int().min(1).max(2_147_483_647),
  values: z.record(z.string(), z.unknown()),
});

const isItemType = (type: string | null): type is ItemType =>
  type !== null && (ITEM_TYPES as readonly string[]).includes(type);

/**
 * What the editor opens on: the staged item, with or without its key; when none was built, the
 * model's draft as converted. A key the document does not show (`unmarked_key`) is left out, so
 * the teacher marks it: the AI never writes a key (ADR 0008).
 */
export function editorStart(entry: {
  item: unknown;
  draft: unknown;
  reasons: readonly string[];
}): unknown {
  if (entry.item !== null && entry.item !== undefined) return entry.item;
  const converted = convertDraft(entry.draft);
  if (!converted.ok) return {};
  if (!entry.reasons.some((reason) => readReason(reason)?.code === "unmarked_key")) {
    return converted.item;
  }
  return Object.fromEntries(Object.entries(converted.item).filter(([key]) => key !== "answerKey"));
}

/** About the batch or the source, not the question's state: a teacher's fix leaves them. */
const KEPT_CODES: readonly string[] = ["duplicate", "instructor_note", "source_error", "note"];

/**
 * The reasons once the teacher has saved the question: whatever the fix answers goes (a missing
 * or unmarked key, a fix, a cut-off or a guess at the type, the old quality warnings), and the
 * quality warnings are worked out again from the saved item.
 */
export function reasonsAfterFix(stored: readonly string[], item: Item): string[] {
  const kept = stored.filter((reason) => KEPT_CODES.includes(readReason(reason)?.code ?? ""));
  const warnings = itemQualityWarnings(item).map((warning) =>
    formatReason({ code: "warning", message: warning.message }),
  );
  return [...kept, ...warnings].slice(0, MAX_REASONS);
}

/** The form as a valid item of `type`, or the refusal to show. */
function itemFromForm(type: ItemType, values: unknown): Item | AiImportFailure {
  const read = inputFromForm(type, values);
  if (!read.ok) return refuse("malformed", read.error);
  const parsed = itemSchema.safeParse(read.values);
  if (!parsed.success || parsed.data.type !== type) return refuse("not_complete");
  return parsed.data;
}

async function batchInReview(service: Client, orgId: string, batchId: string) {
  const { data, error } = await service
    .from("ai_import_batches")
    .select("status")
    .eq("id", batchId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) {
    logged("reading a batch", error);
    return "unavailable";
  }
  return data?.status === "review";
}

export async function saveEntryFix(deps: FixDeps, raw: unknown): Promise<FixResult> {
  const access = await aiImportAccess(deps);
  if (access.status === "signed_out") return refuse("signed_out");
  if (access.status === "forbidden") return refuse("forbidden");
  if (access.status === "disabled") return refuse("not_found");
  if (access.status === "unavailable") return refuse("unavailable");
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return refuse("malformed");
  const input = parsed.data;
  if (!withinItemSizeLimit(input.values)) return refuse("too_large");
  const { supabase, orgId } = access.author;

  const read = await readEntry(supabase as unknown as Client, orgId, input);
  if (read === "unavailable" || read === "not_found") return refuse(read);
  if (read.batchStatus !== "review") return refuse("not_review");
  const { row } = read;
  if (row.kind !== "item" || row.status === "dropped" || !isItemType(row.type)) {
    return refuse("not_editable");
  }
  if (row.version !== input.version) return refuse("entry_changed");

  const item = itemFromForm(row.type, input.values);
  if ("ok" in item) return item;
  const reasons = reasonsAfterFix(row.reasons ?? [], item);
  const status = restoredStatus({
    kind: "item",
    type: row.type,
    item,
    reasons: readStoredReasons(reasons),
  });

  // The service client is not held to the edit policy's "only while in review", so the batch is
  // read again here. A window of milliseconds remains before the write, as for Change type (#346);
  // closing it needs a conditional update in the database, and this story adds no migration.
  const service = deps.service();
  const open = await batchInReview(service, orgId, input.batchId);
  if (open === "unavailable") return refuse("unavailable");
  if (!open) return refuse("not_review");
  const { data, error } = await service
    .from("ai_import_entries")
    .update({ item: JSON.parse(JSON.stringify(item)) as Json, status, reasons })
    .eq("id", input.entryId)
    .eq("batch_id", input.batchId)
    .eq("org_id", orgId)
    .eq("version", input.version)
    .select("version, status");
  if (error) {
    logged("saving a fixed entry", error);
    return refuse("unavailable");
  }
  const [written] = data ?? [];
  // No row: another tab moved the version on since the read.
  if (!written) return refuse("entry_changed");
  return { ok: true, version: written.version, status: written.status as ReviewStatus };
}

/** What the edit page needs of one staged question: never the draft itself, only the start. */
export interface FixEntry {
  id: string;
  version: number;
  type: ItemType;
  status: ReviewStatus;
  reasons: ReviewReason[];
  sourceExcerpt: string;
  /** Its number on the review screen: its place in source order across the import, from 1. */
  number: number;
  /** The stored item JSON the editor opens on (`editorStart`). */
  start: unknown;
}

/**
 * One question of a batch of this workspace and quiz, for its edit page; null when there is no
 * such batch, and no entry when it is not one a teacher can edit here. Read with the teacher's own
 * session (RLS) and filtered by the session's workspace. The draft opens the editor and goes no
 * further.
 */
export async function readFixEntry(
  client: Client,
  orgId: string,
  ids: { bankId: string; batchId: string; entryId: string },
): Promise<{ batchStatus: BatchStatus; entry: FixEntry | null } | null | "unavailable"> {
  const [batch, entry, order] = await Promise.all([
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
      .select("id")
      .eq("batch_id", ids.batchId)
      .eq("org_id", orgId)
      .order("position"),
  ]);
  const error = batch.error ?? entry.error ?? order.error;
  if (error) {
    logged("reading an entry to fix", error);
    return "unavailable";
  }
  if (!batch.data) return null;
  const batchStatus = batch.data.status as BatchStatus;
  const row = entry.data as (EntryRow & { draft: unknown }) | null;
  if (!row || row.kind !== "item" || row.status === "dropped" || !isItemType(row.type)) {
    return { batchStatus, entry: null };
  }
  const view = toEntryView(row);
  const place = ((order.data ?? []) as { id: string }[]).findIndex((other) => other.id === row.id);
  return {
    batchStatus,
    entry: {
      id: row.id,
      version: row.version,
      type: row.type,
      status: view.status,
      reasons: view.reasons,
      sourceExcerpt: row.source_excerpt,
      number: place + 1,
      start: editorStart({ item: row.item, draft: row.draft, reasons: row.reasons ?? [] }),
    },
  };
}
