import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentSource } from "@/lib/assignments/assignments";
import type { PracticeExposure, ShareFailure } from "@/lib/practice/shares";
import type { Database } from "./database.types";

type Client = SupabaseClient<Database>;

/**
 * Practice shares (#240), as the signed-in author: row level security keeps every read and write
 * to the author's own org, and the composite foreign keys refuse a bank or class of another org.
 * Nothing here reads an item.
 */

/** A cap so no list is unbounded; an org shares a handful of banks a term. */
export const SHARE_LIST_LIMIT = 500;

/** One side of a share: the class (on the bank page) or the bank (on the class page). */
export interface ShareEntry {
  id: string;
  name: string;
  sharedAt: string;
}

export type ShareWrite = { ok: true } | { ok: false; reason: ShareFailure };

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "en", { numeric: true });

function entries(
  rows: readonly { id: string; name: string | undefined; sharedAt: string }[],
): ShareEntry[] {
  return rows
    .filter((row): row is ShareEntry => typeof row.name === "string")
    .map((row) => ({ id: row.id, name: row.name, sharedAt: row.sharedAt }))
    .sort(byName);
}

/** The classes a bank is shared with, by name, or null when they could not be read. */
export async function listBankShares(client: Client, bankId: string): Promise<ShareEntry[] | null> {
  const { data, error } = await client
    .from("bank_practice_shares")
    .select("class_id, shared_at, classes(name)")
    .eq("bank_id", bankId)
    .limit(SHARE_LIST_LIMIT);
  if (error || !data) return null;
  return entries(
    data.map((row) => ({ id: row.class_id, name: row.classes?.name, sharedAt: row.shared_at })),
  );
}

/** The banks shared with a class, by name, or null when they could not be read. */
export async function listClassShares(
  client: Client,
  classId: string,
): Promise<ShareEntry[] | null> {
  const { data, error } = await client
    .from("bank_practice_shares")
    .select("bank_id, shared_at, item_banks(name)")
    .eq("class_id", classId)
    .limit(SHARE_LIST_LIMIT);
  if (error || !data) return null;
  return entries(
    data.map((row) => ({ id: row.bank_id, name: row.item_banks?.name, sharedAt: row.shared_at })),
  );
}

/**
 * Every share in the org, as bank id to class names, for the bank list's badges: one read, however
 * many banks. A failed read shows no badges rather than failing the whole list.
 */
export async function listSharedClassNamesByBank(client: Client): Promise<Map<string, string[]>> {
  const { data, error } = await client
    .from("bank_practice_shares")
    .select("bank_id, classes(name)")
    .limit(SHARE_LIST_LIMIT);
  if (error || !data) return new Map();
  const grouped = new Map<string, string[]>();
  for (const row of data) {
    const name = row.classes?.name;
    if (typeof name !== "string") continue;
    grouped.set(row.bank_id, [...(grouped.get(row.bank_id) ?? []), name]);
  }
  return new Map(
    [...grouped].map(([bankId, names]) => [
      bankId,
      [...names].sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    ]),
  );
}

/**
 * Shares a bank with a class. An existing share counts as shared. `gone` covers a bank or class
 * of another org (the foreign keys, 23503) and a caller who is not an author (RLS, 42501).
 */
export async function sharePractice(
  client: Client,
  bankId: string,
  classId: string,
): Promise<ShareWrite> {
  const { error } = await client
    .from("bank_practice_shares")
    .insert({ bank_id: bankId, class_id: classId });
  if (!error || error.code === "23505") return { ok: true };
  if (error.code === "23503" || error.code === "42501") return { ok: false, reason: "gone" };
  if (error.code === "54000") return { ok: false, reason: "rate_limited" };
  return { ok: false, reason: "failed" };
}

/** Stops one share. False when there was nothing to stop or the delete failed. */
export async function stopPractice(
  client: Client,
  bankId: string,
  classId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("bank_practice_shares")
    .delete()
    .eq("bank_id", bankId)
    .eq("class_id", classId)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Which classes can see the answers to what is about to be assigned, in one call. Null when it
 * could not be read, so the form can say it could not check rather than say nothing.
 */
export async function readPracticeExposure(
  client: Client,
  source: AssignmentSource,
): Promise<PracticeExposure | null> {
  const args =
    source.kind === "bank" ? { source_bank: source.id } : { source_case_study: source.id };
  const { data, error } = await client.rpc("practice_exposure", args);
  if (error || !data) return null;
  return {
    classNames: data.map((row) => row.class_name),
    exposedItems: data[0]?.exposed_items ?? 0,
  };
}
