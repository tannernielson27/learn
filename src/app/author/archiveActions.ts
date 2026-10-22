"use server";

import { revalidatePath } from "next/cache";
import type { ArchiveState } from "@/components/authoring/ArchiveButton";
import {
  ARCHIVE_ERRORS,
  archiveCaseStudy,
  archiveItem,
  type ArchiveResult,
  restoreCaseStudy,
  restoreItem,
} from "@/lib/authoring/archive";
import {
  archiveSummary,
  parseArchiveSelection,
  type ArchiveSelectionState,
} from "@/lib/authoring/archiveSelection";
import { archiveSelection } from "@/lib/authoring/archiveSelectionData";
import { isUuid } from "@/lib/authoring/ids";
import { checkRateLimit } from "@/lib/authoring/rateLimit";
import { requireAuthor } from "@/lib/authoring/session";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Change = (client: SupabaseClient<Database>, id: string) => Promise<ArchiveResult>;

/**
 * Archives or restores one item or case study, bound to its id. Counted against the author's save
 * limit (an archive is a small write, like a save). The bank, the editor and the builder show the
 * new status on their next render; nothing redirects, so focus stays on the button.
 */
async function change(id: string, path: string, gone: string, run: Change): Promise<ArchiveState> {
  if (!isUuid(id)) return { status: "error", error: gone };
  const { supabase } = await requireAuthor(`${path}/${id}`);
  const limit = await checkRateLimit(supabase, "save");
  if (!limit.ok) return { status: "error", error: limit.error };
  const result = await run(supabase, id);
  if (!result.ok) return { status: "error", error: result.error };

  revalidatePath(`${path}/${id}`);
  revalidatePath("/author/banks/[bankId]", "page");
  return { status: "idle" };
}

export async function archiveItemAction(itemId: string): Promise<ArchiveState> {
  return change(itemId, "/author/items", ARCHIVE_ERRORS.itemGone, archiveItem);
}

export async function restoreItemAction(itemId: string): Promise<ArchiveState> {
  return change(itemId, "/author/items", ARCHIVE_ERRORS.itemGone, restoreItem);
}

export async function archiveCaseStudyAction(caseStudyId: string): Promise<ArchiveState> {
  return change(
    caseStudyId,
    "/author/case-studies",
    ARCHIVE_ERRORS.caseStudyGone,
    archiveCaseStudy,
  );
}

/**
 * The quiz page's Archive (#471): one row's own Archive, or every checked row. One request, a few
 * writes (see archiveSelection), counted against the save limit like the one-row actions. What
 * stayed, a case study step above all, is said beside what was archived.
 */
export async function archiveSelectedAction(
  bankId: string,
  _previous: ArchiveSelectionState,
  formData: FormData,
): Promise<ArchiveSelectionState> {
  if (!isUuid(bankId)) {
    return { status: "error", error: "That quiz no longer exists.", refusals: [] };
  }
  const selection = parseArchiveSelection(formData);
  if (!selection.ok) return { status: "error", error: selection.error, refusals: [] };

  const { supabase } = await requireAuthor(`/author/banks/${bankId}`);
  const limit = await checkRateLimit(supabase, "save");
  if (!limit.ok) return { status: "error", error: limit.error, refusals: [] };

  const { archived, refusals } = await archiveSelection(supabase, bankId, {
    itemIds: selection.itemIds,
    caseStudyIds: selection.caseStudyIds,
  });
  const message = archiveSummary(archived);
  if (archived.items + archived.caseStudies === 0) {
    return { status: "error", error: message, refusals };
  }
  revalidatePath(`/author/banks/${bankId}`);
  return { status: "done", message, refusals };
}

export async function restoreCaseStudyAction(caseStudyId: string): Promise<ArchiveState> {
  return change(
    caseStudyId,
    "/author/case-studies",
    ARCHIVE_ERRORS.caseStudyGone,
    restoreCaseStudy,
  );
}
