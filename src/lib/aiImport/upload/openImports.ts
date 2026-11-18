import type { OpenImport } from "@/lib/authoring/aiImportUpload";
import { removedPlaces, withoutRemoved } from "../places";
import type { Client } from "./access";

/**
 * A quiz's imports that are not finished, for the quiz page (#591): an import left in review was
 * reachable only through the browser's history, yet still counted towards the workspace's 20
 * open imports. In a module of its own, so the quiz page loads none of the import pipeline.
 */

/** How many the quiz page lists, newest first. A workspace holds at most 20 open imports. */
const OPEN_IMPORTS_SHOWN = 5;

const logged = (step: string, error: { code?: string } | null) => {
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

/**
 * How many questions wait in each of these batches, in two reads however many batches there are:
 * every file row (for the places of removed files) and every entry's position. A question staged
 * late at a removed file's place is not counted, as the review screen does not show it. Five
 * batches hold at most 750 entries, under the Data API's 1,000 rows a read. Positions only: never
 * a question.
 */
async function questionsWaiting(
  client: Client,
  orgId: string,
  batchIds: readonly string[],
): Promise<Map<string, number>> {
  const [files, entries] = await Promise.all([
    client
      .from("ai_import_files")
      .select("batch_id, status, rejected_reason")
      .in("batch_id", batchIds)
      .eq("org_id", orgId)
      .order("created_at")
      .order("id"),
    client
      .from("ai_import_entries")
      .select("batch_id, position")
      .in("batch_id", batchIds)
      .eq("org_id", orgId),
  ]);
  const error = files.error ?? entries.error;
  if (error) {
    logged("counting the questions waiting for review", error);
    return new Map();
  }
  return new Map(
    batchIds.map((id) => {
      const removed = removedPlaces((files.data ?? []).filter((file) => file.batch_id === id));
      const staged = (entries.data ?? []).filter((entry) => entry.batch_id === id);
      return [id, withoutRemoved(staged, removed).length] as const;
    }),
  );
}

/**
 * Read with the teacher's own session, so RLS decides as well as the workspace filter. Statuses
 * and counts only, never a question. Only an import in review shows a count, so only those are
 * counted. A failure reads as none: the quiz page opens without it.
 */
export async function readOpenImports(
  client: Client,
  orgId: string,
  bankId: string,
): Promise<OpenImport[]> {
  const { data, error } = await client
    .from("ai_import_batches")
    .select("id, status")
    .eq("org_id", orgId)
    .eq("bank_id", bankId)
    .in("status", ["uploading", "parsing", "review"])
    .order("created_at", { ascending: false })
    .limit(OPEN_IMPORTS_SHOWN);
  if (error) {
    logged("listing a quiz's open imports", error);
    return [];
  }
  const batches = data ?? [];
  const inReview = batches.filter((batch) => batch.status === "review").map((batch) => batch.id);
  const waiting =
    inReview.length > 0
      ? await questionsWaiting(client, orgId, inReview)
      : new Map<string, number>();
  return batches.map((batch) => ({
    id: batch.id,
    status: batch.status as OpenImport["status"],
    questions: waiting.get(batch.id) ?? 0,
  }));
}
