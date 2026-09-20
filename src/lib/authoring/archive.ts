import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isUuid } from "./ids";

type Client = SupabaseClient<Database>;

export type ArchiveResult = { ok: true } | { ok: false; error: string };

export const ARCHIVE_ERRORS = {
  itemGone: "This item no longer exists.",
  caseStudyGone: "This case study no longer exists.",
  failed: "That could not be done. Try again.",
  itemArchived: "This item is archived. Restore it before you change or publish it.",
  caseStudyArchived: "This case study is archived. Restore it before you change or publish it.",
  stepArchived: "That item is archived. Restore it before you place it as a step.",
} as const;

interface DbError {
  code?: string;
  details?: string;
  hint?: string;
}

/** 55000: the database refused to change archived content (see the archive migration). */
export function isArchivedError(error: DbError | null): boolean {
  return error?.code === "55000";
}

/** Why a case study step cannot be archived on its own, naming the case study when known. */
export function stepArchiveRefusal(caseTitle: string | undefined, position: string | undefined) {
  const where =
    caseTitle && position
      ? `This item is step ${position} of the case study "${caseTitle}".`
      : "This item is a step in a case study.";
  return `${where} Archive the case study instead, or give that step another item first.`;
}

type ArchiveFunction =
  "archive_item" | "restore_item" | "archive_case_study" | "restore_case_study";

/**
 * One database call that archives or restores. Archiving keeps content and version and remembers
 * the status to restore; RLS decides whether the caller may see the row (22023 when not). An item
 * that is a case study step is refused (2BP01) with the case study's title and the step.
 */
async function call(client: Client, fn: ArchiveFunction, id: string, gone: string) {
  if (!isUuid(id)) return { ok: false, error: gone } satisfies ArchiveResult;
  const { error } = await client.rpc(fn, { target: id });
  if (!error) return { ok: true } satisfies ArchiveResult;
  if (error.code === "22023") return { ok: false, error: gone } satisfies ArchiveResult;
  if (error.code === "2BP01") {
    return {
      ok: false,
      error: stepArchiveRefusal(error.details || undefined, error.hint || undefined),
    } satisfies ArchiveResult;
  }
  return { ok: false, error: ARCHIVE_ERRORS.failed } satisfies ArchiveResult;
}

export const archiveItem = (client: Client, itemId: string): Promise<ArchiveResult> =>
  call(client, "archive_item", itemId, ARCHIVE_ERRORS.itemGone);

export const restoreItem = (client: Client, itemId: string): Promise<ArchiveResult> =>
  call(client, "restore_item", itemId, ARCHIVE_ERRORS.itemGone);

export const archiveCaseStudy = (client: Client, caseStudyId: string): Promise<ArchiveResult> =>
  call(client, "archive_case_study", caseStudyId, ARCHIVE_ERRORS.caseStudyGone);

export const restoreCaseStudy = (client: Client, caseStudyId: string): Promise<ArchiveResult> =>
  call(client, "restore_case_study", caseStudyId, ARCHIVE_ERRORS.caseStudyGone);
