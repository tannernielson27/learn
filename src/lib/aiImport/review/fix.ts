import { z } from "zod";
import { inputFromForm } from "@/lib/authoring/forms/codecs";
import { caseSteps, stepType } from "@/lib/authoring/aiImportCaseStudy";
import {
  readStoredReasons,
  restoredStatus,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import { messageFor, type AiImportFailure } from "@/lib/authoring/aiImportUpload";
import { withinItemSizeLimit } from "@/lib/authoring/payloadSize";
import { ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import { itemQualityWarnings } from "@/lib/ngn/quality";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import type { Json } from "@/lib/supabase/database.types";
import { refreshBatchDuplicates } from "../duplicates";
import { convertDraft, formatReason, MAX_REASONS, readReason } from "../stage";
import { aiImportAccess, type AccessDeps, type Client } from "../upload/access";
import { readEntry } from "./actions";
import { draftWithSaved, withStepSaved } from "./caseStudy";
import { reviewAllowance, type ReviewLimitDeps } from "./limit";
import { ENTRY_COLUMNS, type EntryRow } from "./read";

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
 *
 * A case study's step is saved the same way (#593, "add the key per step"): the request names the
 * step, the form must be a whole, valid question of that step's own stored type, and it is put
 * back into the case study (`withStepSaved`), which becomes ready once every step is keyed and
 * the whole passes its schema. Nothing else of the case study can be changed from here.
 */

export interface FixDeps extends AccessDeps, ReviewLimitDeps {
  service: () => Client;
}

export type FixResult = { ok: true; version: number; status: ReviewStatus } | AiImportFailure;

const FIX_MESSAGES = {
  not_editable: "Only a question that has not been dropped can be edited here.",
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
  /** A case study's step, from 1; absent for a single question. */
  step: z.number().int().min(1).max(6).optional(),
  values: z.record(z.string(), z.unknown()),
});

export const isItemType = (type: string | null): type is ItemType =>
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

/** The type the form must be: the question's own, or the named step's as it is stored. */
function editedType(row: EntryRow, step: number | undefined): ItemType | null {
  if (step === undefined) return row.kind === "item" && isItemType(row.type) ? row.type : null;
  if (row.kind !== "case_study") return null;
  const question = caseSteps(row.item)?.[step - 1];
  return question ? stepType(question) : null;
}

/** What a saved question's entry becomes. */
function fixedQuestion(row: EntryRow, type: ItemType, item: Item) {
  const reasons = reasonsAfterFix(row.reasons ?? [], item);
  const status = restoredStatus({
    kind: "item",
    type,
    item,
    reasons: readStoredReasons(reasons),
  });
  return { item: item as unknown, status, reasons };
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
  const allowed = await reviewAllowance(deps, access.author.userId);
  if (allowed !== "ok") return refuse(allowed);
  const { supabase, orgId } = access.author;

  // A step's save notes on the draft that the teacher saved it, so the draft is read with it.
  const read = await readEntry(
    supabase as unknown as Client,
    orgId,
    input,
    input.step === undefined ? ENTRY_COLUMNS : `${ENTRY_COLUMNS}, draft`,
  );
  if (read === "unavailable" || read === "not_found") return refuse(read);
  if (read.batchStatus !== "review") return refuse("not_review");
  const { row } = read;
  const type = row.status === "dropped" ? null : editedType(row, input.step);
  if (type === null) return refuse("not_editable");
  if (row.version !== input.version) return refuse("entry_changed");

  const item = itemFromForm(type, input.values);
  if ("ok" in item) return item;
  const fixed =
    input.step === undefined
      ? fixedQuestion(row, type, item)
      : withStepSaved({ item: row.item, reasons: row.reasons ?? [] }, input.step, item);
  if (!fixed) return refuse("not_editable");
  // A case study is stored whole, so the whole is measured, as the import measures it.
  if (!withinItemSizeLimit(fixed.item)) return refuse("too_large");
  const { status, reasons } = fixed;

  // The service client is not held to the edit policy's "only while in review", so the batch is
  // read again here. A window of milliseconds remains before the write, as for Change type (#346);
  // closing it needs a conditional update in the database, and this story adds no migration.
  const service = deps.service();
  const open = await batchInReview(service, orgId, input.batchId);
  if (open === "unavailable") return refuse("unavailable");
  if (!open) return refuse("not_review");
  const { data, error } = await service
    .from("ai_import_entries")
    .update({
      item: JSON.parse(JSON.stringify(fixed.item)) as Json,
      status,
      reasons,
      ...(input.step === undefined
        ? {}
        : {
            draft: draftWithSaved(
              (row as EntryRow & { draft?: unknown }).draft,
              input.step,
            ) as Json,
          }),
    })
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
  // #593: an edited stem may no longer match another question's, or may now match one. If this
  // entry's own flag changed it was written again, and the version the editor needs moved on.
  const flags = await refreshBatchDuplicates(service, { orgId, batchId: input.batchId });
  const version = (flags.ok ? flags.versions.get(input.entryId) : undefined) ?? written.version;
  return { ok: true, version, status: written.status as ReviewStatus };
}
