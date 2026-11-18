import type { OpenImport } from "@/lib/authoring/aiImportUpload";
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
 * Read with the teacher's own session, so RLS decides as well as the workspace filter. Statuses
 * and counts only, never a question. A failure reads as none: the quiz page opens without it.
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
  return Promise.all(
    (data ?? []).map(async (batch) => {
      const counted = await client
        .from("ai_import_entries")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batch.id)
        .eq("org_id", orgId);
      if (counted.error) logged("counting an import's questions", counted.error);
      return {
        id: batch.id,
        status: batch.status as OpenImport["status"],
        questions: counted.count ?? 0,
      };
    }),
  );
}
