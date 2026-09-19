"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { DuplicateState } from "@/components/authoring/DuplicateButton";
import { DUPLICATE_ERRORS, duplicateCaseStudy, duplicateItem } from "@/lib/authoring/duplicate";
import { isUuid } from "@/lib/authoring/ids";
import { requireAuthor } from "@/lib/authoring/session";

/**
 * Copies an item as a draft in its own bank and folder, then opens the copy in its editor. Bound to
 * the item; the form's state and data carry nothing it needs.
 */
export async function duplicateItemAction(itemId: string): Promise<DuplicateState> {
  if (!isUuid(itemId)) return { status: "error", error: DUPLICATE_ERRORS.itemGone };
  const { supabase } = await requireAuthor(`/author/items/${itemId}`);
  const result = await duplicateItem(supabase, itemId);
  if (!result.ok) return { status: "error", error: result.error };

  revalidatePath("/author/banks/[bankId]", "page");
  redirect(`/author/items/${result.value.id}`);
}

/** Copies a case study with its record and steps, then opens the copy in the builder. */
export async function duplicateCaseStudyAction(caseStudyId: string): Promise<DuplicateState> {
  if (!isUuid(caseStudyId)) return { status: "error", error: DUPLICATE_ERRORS.caseStudyGone };
  const { supabase } = await requireAuthor(`/author/case-studies/${caseStudyId}`);
  const result = await duplicateCaseStudy(supabase, caseStudyId);
  if (!result.ok) return { status: "error", error: result.error };

  revalidatePath("/author/banks/[bankId]", "page");
  redirect(`/author/case-studies/${result.value.id}`);
}
