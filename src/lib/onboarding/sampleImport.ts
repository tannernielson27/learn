import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, isRateLimitedError, RATE_LIMIT_ERRORS } from "@/lib/authoring/rateLimit";
import type { ImportRows } from "@/lib/authoring/transfer";
import type { Database, Json } from "@/lib/supabase/database.types";
import { SAMPLE_BANK_NAME, sampleImport } from "./sampleBank";

type Client = SupabaseClient<Database>;

export const SAMPLE_IMPORT_ERRORS = {
  failed: "The sample bank could not be imported. Try again.",
} as const;

export type SampleImportResult =
  { ok: true; bankId: string; created: boolean } | { ok: false; error: string };

/**
 * Makes "Sample bank" in the author's org and fills it through the import path (#265), published
 * and ready to assign or run live (#283), or finds the one the org already has. Runs as the caller:
 * RLS limits every read and write to their own org, and the org id written is the one
 * `requireAuthor` read from their profile.
 */
export async function importSampleBank(
  client: Client,
  author: { orgId: string; userId: string },
): Promise<SampleImportResult> {
  const existing = await findSampleBank(client, author.orgId);
  if (!existing.ok) return { ok: false, error: SAMPLE_IMPORT_ERRORS.failed };
  if (existing.bankId) return { ok: true, bankId: existing.bankId, created: false };

  // Asked before the bank is made, so an author over the import limit is left with nothing.
  // import_bank_content takes the count itself, once, when it writes.
  const limit = await checkRateLimit(client, "import");
  if (!limit.ok) return { ok: false, error: limit.error };

  const sample = sampleImport();
  if (!sample.ok) return { ok: false, error: SAMPLE_IMPORT_ERRORS.failed };

  const { data: bank, error } = await client
    .from("item_banks")
    .insert({ name: SAMPLE_BANK_NAME, org_id: author.orgId, created_by: author.userId })
    .select("id")
    .single();
  if (error || !bank) return { ok: false, error: SAMPLE_IMPORT_ERRORS.failed };

  const written = await importPublished(client, bank.id, sample.rows);
  if (!written.ok) {
    // The import writes all or nothing, so the bank is empty: remove it, or the next try would be
    // sent to an empty "Sample bank". If the removal fails too, the next try opens that bank.
    await client.from("item_banks").delete().eq("id", bank.id).eq("org_id", author.orgId);
    return { ok: false, error: written.error };
  }
  return { ok: true, bankId: bank.id, created: true };
}

/**
 * `import_sample_bank` writes the rows through `import_bank_content` and publishes exactly the rows
 * that call wrote, in one transaction and for one import unit (#283). It refuses a bank that
 * already holds anything, so nothing already in the bank or the org changes.
 */
async function importPublished(
  client: Client,
  bankId: string,
  rows: ImportRows,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.rpc("import_sample_bank", {
    target_bank: bankId,
    new_items: rows.items as unknown as Json,
    new_case_study: rows.caseStudy as unknown as Json,
  });
  if (!error) return { ok: true };
  if (isRateLimitedError(error)) return { ok: false, error: RATE_LIMIT_ERRORS.limited };
  return { ok: false, error: SAMPLE_IMPORT_ERRORS.failed };
}

async function findSampleBank(
  client: Client,
  orgId: string,
): Promise<{ ok: true; bankId: string | null } | { ok: false }> {
  const { data, error } = await client
    .from("item_banks")
    .select("id")
    .eq("org_id", orgId)
    .eq("name", SAMPLE_BANK_NAME)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data) return { ok: false };
  return { ok: true, bankId: data[0]?.id ?? null };
}
