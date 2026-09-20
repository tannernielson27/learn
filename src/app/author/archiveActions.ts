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

export async function restoreCaseStudyAction(caseStudyId: string): Promise<ArchiveState> {
  return change(
    caseStudyId,
    "/author/case-studies",
    ARCHIVE_ERRORS.caseStudyGone,
    restoreCaseStudy,
  );
}
