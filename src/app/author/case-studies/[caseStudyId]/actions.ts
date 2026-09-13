"use server";

import { revalidatePath } from "next/cache";
import type { SaveResult } from "@/components/authoring/EditorShell";
import { CASE_STUDY_ERRORS, saveRecordForm } from "@/lib/authoring/caseStudies";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";

/**
 * Saves the record editor's form as the case study's record. `saveRecordForm` checks the size and
 * the strict draft shape before writing; RLS decides whether this author may write the row.
 */
export async function saveCaseStudyRecord(
  caseStudyId: string,
  values: unknown,
): Promise<SaveResult> {
  if (!isUuid(caseStudyId)) return { ok: false, error: CASE_STUDY_ERRORS.gone };
  const { supabase } = await requireAuthor(`/author/case-studies/${caseStudyId}/record`);
  const result = await saveRecordForm(supabase, caseStudyId, values);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath(`/author/case-studies/${caseStudyId}`);
  revalidatePath("/author/banks/[bankId]", "page");
  return { ok: true };
}
