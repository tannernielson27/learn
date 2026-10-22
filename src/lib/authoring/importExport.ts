import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { fromItemRow } from "@/lib/supabase/itemRows";
import { assembleCaseStudy, CASE_STUDY_WITH_STEPS } from "./caseStudies";
import {
  caseStudyEnvelope,
  itemsEnvelope,
  type CaseStudyEnvelope,
  type ItemsEnvelope,
} from "./transfer";

type Client = SupabaseClient<Database>;

export const TRANSFER_ERRORS = {
  notFound: "That no longer exists.",
  unfinishedItem:
    "Finish this question before exporting it. Only a finished question can be exported.",
  unfinishedCaseStudy: "Finish every step of this case study before exporting it.",
} as const;

export type ExportResult<Envelope> =
  | { ok: true; envelope: Envelope }
  | { ok: false; status: 404 | 409; error: string; blockers?: string[] };

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
