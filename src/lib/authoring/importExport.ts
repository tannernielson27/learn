import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { fromItemRow } from "@/lib/supabase/itemRows";
import { assembleCaseStudy, CASE_STUDY_WITH_STEPS } from "./caseStudies";
import {
  caseStudyEnvelope,
  itemsEnvelope,
  type CaseStudyEnvelope,
  type ImportRows,
  type ItemsEnvelope,
} from "./transfer";

type Client = SupabaseClient<Database>;

export const TRANSFER_ERRORS = {
  bankGone: "That bank no longer exists.",
  importFailed: "The import could not be saved, so nothing was imported. Try again.",
  notFound: "That no longer exists.",
  unfinishedItem: "Finish this item before exporting it. Only a valid item can be exported.",
  unfinishedCaseStudy: "Finish every step of this case study before exporting it.",
} as const;

export type ExportResult<Envelope> =
  | { ok: true; envelope: Envelope }
  | { ok: false; status: 404 | 409; error: string; blockers?: string[] };

/**
 * Writes a whole import through one database function, so either everything lands or nothing
 * does. The function runs as the caller: RLS decides which bank it may write, and every item gets
 * a new id and draft status there.
 */
export async function importIntoBank(
  client: Client,
  bankId: string,
  rows: ImportRows,
): Promise<
  | { ok: true; value: { itemIds: string[]; caseStudyId: string | null } }
  | { ok: false; error: string }
> {
  const { data, error } = await client.rpc("import_bank_content", {
    target_bank: bankId,
    new_items: (rows.items.length > 0 ? rows.items : null) as unknown as Json,
    new_case_study: rows.caseStudy as unknown as Json,
  });
  if (error) {
    // 22023: the bank is not one the caller can see (or the payload is malformed).
    return {
      ok: false,
      error: error.code === "22023" ? TRANSFER_ERRORS.bankGone : TRANSFER_ERRORS.importFailed,
    };
  }
  const result = (data ?? {}) as { item_ids?: string[]; case_study_id?: string | null };
  return {
    ok: true,
    value: { itemIds: result.item_ids ?? [], caseStudyId: result.case_study_id ?? null },
  };
}

/** An item as learn.v1, with its key and rationale: only a valid item exports. */
export async function readItemExport(
  client: Client,
  itemId: string,
): Promise<ExportResult<ItemsEnvelope>> {
  const { data: row, error } = await client
    .from("items")
    .select("id, type, cjmm_step, tags, version, status, content, answer_key, rationale, scoring")
    .eq("id", itemId)
    .maybeSingle();
  if (error || !row) return { ok: false, status: 404, error: TRANSFER_ERRORS.notFound };
  const stored = fromItemRow(row);
  if (!stored.ok) return { ok: false, status: 409, error: TRANSFER_ERRORS.unfinishedItem };
  return { ok: true, envelope: itemsEnvelope([stored.value]) };
}

/** A case study as learn.v1: its record and six finished steps, drafts included. */
export async function readCaseStudyExport(
  client: Client,
  caseStudyId: string,
): Promise<ExportResult<CaseStudyEnvelope>> {
  const { data: row, error } = await client
    .from("case_studies")
    .select(CASE_STUDY_WITH_STEPS)
    .eq("id", caseStudyId)
    .maybeSingle();
  if (error || !row) return { ok: false, status: 404, error: TRANSFER_ERRORS.notFound };
  const assembled = assembleCaseStudy(row, "preview");
  if (!assembled.ok) {
    return {
      ok: false,
      status: 409,
      error: TRANSFER_ERRORS.unfinishedCaseStudy,
      blockers: assembled.blockers,
    };
  }
  return { ok: true, envelope: caseStudyEnvelope(assembled.caseStudy) };
}
