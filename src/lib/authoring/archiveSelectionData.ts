import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ARCHIVE_SELECTION_ERRORS, stepRefusal, type ArchiveCounts } from "./archiveSelection";
import { stemExcerpt } from "./banks";
import { isRateLimitedError, RATE_LIMIT_ERRORS } from "./rateLimit";

type Client = SupabaseClient<Database>;
type Table = "items" | "case_studies";
type Status = "draft" | "published";

export interface ArchiveSelectionOutcome {
  archived: ArchiveCounts;
  /** Why some of the selection stayed, one line each, in the order they were met. */
  refusals: string[];
}

interface DbError {
  code?: string;
}

/** A write's refusal, in plain words; 2BP01 is a question placed as a step after the check. */
function writeRefusal(error: DbError): string {
  if (isRateLimitedError(error)) return RATE_LIMIT_ERRORS.limited;
  if (error.code === "2BP01") {
    return "A question became a step in a case study while this was archived, so it stays. Reload the page and try again.";
  }
  return ARCHIVE_SELECTION_ERRORS.failed;
}

/**
 * Archives one status's rows in a single UPDATE, which is one request and so one `save` against
 * the authoring limit however many rows it carries. archived_from takes the status the row had,
 * which the archive trigger checks; filtering on that status means a row whose status changed
 * since it was read is left alone rather than archived with the wrong one.
 */
async function archiveGroup(
  client: Client,
  table: Table,
  bankId: string,
  status: Status,
  ids: readonly string[],
): Promise<{ count: number; error?: string }> {
  if (ids.length === 0) return { count: 0 };
  const { data, error } = await client
    .from(table)
    .update({ status: "archived", archived_from: status })
    .eq("bank_id", bankId)
    .eq("status", status)
    .in("id", [...ids])
    .select("id");
  if (error) return { count: 0, error: writeRefusal(error) };
  const count = data?.length ?? 0;
  return count < ids.length ? { count, error: ARCHIVE_SELECTION_ERRORS.changed } : { count };
}

interface Row {
  id: string;
  status: string;
}

/** The selected rows that are this quiz's, by status; what is already archived needs nothing. */
function sortRows(rows: readonly Row[], asked: readonly string[]) {
  const draft = rows.filter((row) => row.status === "draft").map((row) => row.id);
  const published = rows.filter((row) => row.status === "published").map((row) => row.id);
  const missing = rows.length < asked.length;
  return { draft, published, missing };
}

interface StepRow {
  item_id: string;
  position: number;
  case_studies: { title: string } | { title: string }[] | null;
}

function stepTitle(row: StepRow): string {
  const embed = Array.isArray(row.case_studies) ? row.case_studies[0] : row.case_studies;
  return embed?.title ?? "";
}

/** Writes the groups in turn, stopping at the first refusal (the save limit refuses the rest). */
async function archiveGroups(
  client: Client,
  table: Table,
  bankId: string,
  groups: { draft: readonly string[]; published: readonly string[] },
  refusals: string[],
): Promise<number> {
  let count = 0;
  for (const status of ["draft", "published"] as const) {
    const written = await archiveGroup(client, table, bankId, status, groups[status]);
    count += written.count;
    if (written.error) {
      refusals.push(written.error);
      break;
    }
  }
  return count;
}

async function archiveItems(
  client: Client,
  bankId: string,
  itemIds: readonly string[],
  refusals: string[],
): Promise<number | null> {
  const { data, error } = await client
    .from("items")
    .select("id, status, stem:content->stem")
    .eq("bank_id", bankId)
    .in("id", [...itemIds]);
  if (error || !data) return null;
  const rows = data as unknown as (Row & { stem: unknown })[];
  const sorted = sortRows(rows, itemIds);
  const open = [...sorted.draft, ...sorted.published];

  // The archive trigger refuses a step on its own, and one refused row would fail the whole
  // UPDATE; so the steps are found first, named, and left out.
  const steps = new Set<string>();
  if (open.length > 0) {
    const { data: stepData, error: stepError } = await client
      .from("case_study_items")
      .select("item_id, position, case_studies(title)")
      .in("item_id", open);
    if (stepError) return null;
    for (const step of (stepData ?? []) as unknown as StepRow[]) {
      if (steps.has(step.item_id)) continue;
      steps.add(step.item_id);
      const row = rows.find((candidate) => candidate.id === step.item_id);
      refusals.push(stepRefusal(stemExcerpt(row?.stem, 60), stepTitle(step), step.position));
    }
  }
  if (sorted.missing) refusals.push(ARCHIVE_SELECTION_ERRORS.changed);

  const notStep = (id: string) => !steps.has(id);
  return archiveGroups(
    client,
    "items",
    bankId,
    { draft: sorted.draft.filter(notStep), published: sorted.published.filter(notStep) },
    refusals,
  );
}

async function archiveCaseStudies(
  client: Client,
  bankId: string,
  caseStudyIds: readonly string[],
  refusals: string[],
): Promise<number | null> {
  const { data, error } = await client
    .from("case_studies")
    .select("id, status")
    .eq("bank_id", bankId)
    .in("id", [...caseStudyIds]);
  if (error || !data) return null;
  const sorted = sortRows(data as Row[], caseStudyIds);
  if (sorted.missing) refusals.push(ARCHIVE_SELECTION_ERRORS.changed);
  return archiveGroups(client, "case_studies", bankId, sorted, refusals);
}

/**
 * Archives the selected questions and case studies of one quiz, under the caller's RLS. At most
 * four writes, each one request: a quiz page's worth of rows costs at most four saves, where one
 * archive_item call per row would spend a save each and run out of the minute's 60 part-way.
 *
 * Everything the archive migration enforces still holds, because its triggers run on these
 * UPDATEs exactly as on archive_item's: content and version never change, archived_from is the
 * status the row had, and a case study step is refused. Restoring is the Archived view's Restore.
 */
export async function archiveSelection(
  client: Client,
  bankId: string,
  selection: { itemIds: readonly string[]; caseStudyIds: readonly string[] },
): Promise<ArchiveSelectionOutcome> {
  const refusals: string[] = [];
  const archived: ArchiveCounts = { items: 0, caseStudies: 0 };

  if (selection.itemIds.length > 0) {
    const items = await archiveItems(client, bankId, selection.itemIds, refusals);
    if (items === null) return { archived, refusals: [ARCHIVE_SELECTION_ERRORS.failed] };
    archived.items = items;
  }
  // A refusal from the save limit means the next write would be refused too.
  if (refusals.includes(RATE_LIMIT_ERRORS.limited)) return { archived, refusals };

  if (selection.caseStudyIds.length > 0) {
    const caseStudies = await archiveCaseStudies(client, bankId, selection.caseStudyIds, refusals);
    if (caseStudies === null) {
      return { archived, refusals: [...refusals, ARCHIVE_SELECTION_ERRORS.failed] };
    }
    archived.caseStudies = caseStudies;
  }
  return { archived, refusals };
}
