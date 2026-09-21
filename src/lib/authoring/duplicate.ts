import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isUuid } from "./ids";
import { isRateLimitedError, RATE_LIMIT_ERRORS } from "./rateLimit";

type Client = SupabaseClient<Database>;

export type DuplicateResult = { ok: true; value: { id: string } } | { ok: false; error: string };

export const DUPLICATE_ERRORS = {
  itemGone: "This item no longer exists.",
  itemFailed: "The item could not be duplicated. Try again.",
  caseStudyGone: "This case study no longer exists.",
  caseStudyFailed: "The case study could not be duplicated. Try again.",
} as const;

/**
 * Copies an item as a new draft at version 1, with "(copy)" before its stem, in the same bank and
 * folder with the same tags. One database call; RLS decides whether the caller may read the item.
 */
export async function duplicateItem(client: Client, itemId: string): Promise<DuplicateResult> {
  if (!isUuid(itemId)) return { ok: false, error: DUPLICATE_ERRORS.itemGone };
  const { data, error } = await client.rpc("duplicate_item", { source_item: itemId });
  return copied(data, error, DUPLICATE_ERRORS.itemGone, DUPLICATE_ERRORS.itemFailed);
}

/**
 * Copies a case study, its record and each step item in one database call, so either the whole
 * copy lands or none of it does. The copy is a draft titled "... (copy)"; its steps are new items.
 */
export async function duplicateCaseStudy(
  client: Client,
  caseStudyId: string,
): Promise<DuplicateResult> {
  if (!isUuid(caseStudyId)) return { ok: false, error: DUPLICATE_ERRORS.caseStudyGone };
  const { data, error } = await client.rpc("duplicate_case_study", {
    source_case_study: caseStudyId,
  });
  return copied(data, error, DUPLICATE_ERRORS.caseStudyGone, DUPLICATE_ERRORS.caseStudyFailed);
}

/**
 * 22023: the source is not one the caller can see. Only a well-formed id is a copy.
 *
 * 54000 arrives here since #123: duplicating writes to `items` and `case_studies`, so it spends a
 * `save` like any other write and can be refused for being over the limit. Without this branch an
 * author who hit the budget while reorganising would read "could not be duplicated", which sounds
 * like the copy was broken rather than merely too soon.
 */
function copied(
  data: unknown,
  error: { code?: string } | null,
  gone: string,
  failed: string,
): DuplicateResult {
  if (isRateLimitedError(error)) return { ok: false, error: RATE_LIMIT_ERRORS.limited };
  if (error) return { ok: false, error: error.code === "22023" ? gone : failed };
  if (typeof data !== "string" || !isUuid(data)) return { ok: false, error: failed };
  return { ok: true, value: { id: data } };
}
