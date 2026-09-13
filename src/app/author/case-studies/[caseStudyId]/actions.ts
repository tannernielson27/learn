"use server";

import { revalidatePath } from "next/cache";
import type { SaveResult } from "@/components/authoring/EditorShell";
import {
  CASE_STUDY_ERRORS,
  publishCaseStudy,
  saveRecordForm,
  startStep,
} from "@/lib/authoring/caseStudies";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";
import { ITEM_TYPES, type ItemType } from "@/lib/ngn/labels";
import type { CjmmStep } from "@/lib/ngn/types";

function revalidateCaseStudy(caseStudyId: string) {
  revalidatePath(`/author/case-studies/${caseStudyId}`);
  revalidatePath("/author/banks/[bankId]", "page");
}

/**
 * Saves the record editor's form as the case study's record. `saveRecordForm` checks the size and
 * the strict draft shape before writing; RLS decides whether this author may write the row.
 */
export async function saveCaseStudyRecord(
  caseStudyId: string,
  values: unknown,
): Promise<SaveResult> {
  if (!isUuid(caseStudyId)) return { ok: false, error: CASE_STUDY_ERRORS.gone };
  const { supabase } = await requireAuthor(`/author/case-studies/${caseStudyId}`);
  const result = await saveRecordForm(supabase, caseStudyId, values);
  if (!result.ok) return { ok: false, error: result.error };

  revalidateCaseStudy(caseStudyId);
  return { ok: true };
}

/**
 * Starts a step with a new draft item of the chosen type, or replaces the step's item with one of
 * a new type. Every argument is checked here, since the client can send anything.
 */
export async function startStepItem(
  caseStudyId: string,
  position: number,
  type: string,
): Promise<{ error: string }> {
  if (!isUuid(caseStudyId)) return { error: CASE_STUDY_ERRORS.gone };
  if (!Number.isInteger(position) || position < 1 || position > 6) {
    return { error: "That step does not exist." };
  }
  if (!(ITEM_TYPES as readonly string[]).includes(type)) {
    return { error: "That item type cannot be authored yet." };
  }

  const { supabase, userId } = await requireAuthor(`/author/case-studies/${caseStudyId}`);
  const result = await startStep(supabase, {
    caseStudyId,
    position: position as CjmmStep,
    type: type as ItemType,
    userId,
  });
  if (!result.ok) return { error: result.error };

  revalidateCaseStudy(caseStudyId);
  return { error: "" };
}

export type PublishCaseStudyResult =
  { ok: true } | { ok: false; error: string; blockers?: string[] };

/**
 * Publishes the case study when the whole of it validates, naming every blocker when it does not.
 * Each step item is published from its own step first; this publishes the case study itself.
 */
export async function publishCaseStudyAction(caseStudyId: string): Promise<PublishCaseStudyResult> {
  if (!isUuid(caseStudyId)) return { ok: false, error: CASE_STUDY_ERRORS.gone };
  const { supabase } = await requireAuthor(`/author/case-studies/${caseStudyId}`);
  const result = await publishCaseStudy(supabase, caseStudyId);
  if (!result.ok) return { ok: false, error: result.error, blockers: result.blockers };

  revalidateCaseStudy(caseStudyId);
  return { ok: true };
}
