import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { normalizePassage } from "./sourceText";
import { formatReason, readReason, type EntryReason } from "./stage";

/**
 * Duplicates (#343): the same question twice in one batch (a document uploaded as both .pdf and
 * .docx), or a question the workspace already has in a quiz. Each is told apart by a hash of its
 * stem, normalized as `normalizePassage` does (case, markup, punctuation and spacing ignored).
 * A duplicate is flagged for the reviewer, never dropped: they decide.
 *
 * Run once a batch's units are all extracted (#345), and again whenever that is not certain: it
 * replaces the `duplicate` reasons it wrote before, so running it twice changes nothing.
 */

type Client = SupabaseClient<Database>;

/** Hex SHA-256 of a stem's normalized words; null for a stem with none. */
export function stemHash(stem: string): string | null {
  const normalized = normalizePassage(stem);
  return normalized ? createHash("sha256").update(normalized).digest("hex") : null;
}

export interface EntryForDuplicates {
  id: string;
  position: number;
  /** The item's stem, the draft's, or the source excerpt, in that order. */
  stem: string;
  reasons: string[];
}

const IN_BATCH: EntryReason = {
  code: "duplicate",
  message: "The same question is earlier in this import. Keep one of them.",
};
const IN_WORKSPACE: EntryReason = {
  code: "duplicate",
  message: "This question is already in one of your workspace's quizzes.",
};

/**
 * The reasons each entry should have, by id, for the entries whose reasons change. The first of a
 * batch's copies (by position) is not flagged for the batch; every copy is flagged for the
 * workspace.
 */
export function duplicateReasons(
  entries: readonly EntryForDuplicates[],
  workspaceStems: readonly string[],
): Map<string, string[]> {
  const known = new Set(workspaceStems.map(stemHash).filter((hash) => hash !== null));
  const seen = new Set<string>();
  const changes = new Map<string, string[]>();
  for (const entry of [...entries].sort((a, b) => a.position - b.position)) {
    const hash = stemHash(entry.stem);
    const found: EntryReason[] = [];
    if (hash !== null) {
      if (seen.has(hash)) found.push(IN_BATCH);
      if (known.has(hash)) found.push(IN_WORKSPACE);
      seen.add(hash);
    }
    const kept = entry.reasons.filter((reason) => readReason(reason)?.code !== "duplicate");
    const next = [...kept, ...found.map(formatReason)].slice(0, 20);
    if (next.length !== entry.reasons.length || next.some((r, i) => r !== entry.reasons[i])) {
      changes.set(entry.id, next);
    }
  }
  return changes;
}

const stringAt = (value: unknown, ...path: string[]): string | null => {
  let node = value;
  for (const key of path) {
    if (node === null || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "string" ? node : null;
};

/** The stem an entry is compared by. */
export function entryStem(row: { item: unknown; draft: unknown; source_excerpt: string }): string {
  return stringAt(row.item, "stem", "value") ?? stringAt(row.draft, "stem") ?? row.source_excerpt;
}

/** At most this many of the workspace's questions are compared; a larger library is cut off. */
const WORKSPACE_LIMIT = 5_000;

const logged = (step: string, error: { code?: string } | null) => {
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

/** Flags a batch's duplicates, on the service-role client. Returns how many entries changed. */
export async function markDuplicates(
  service: Client,
  ref: { orgId: string; batchId: string },
): Promise<{ ok: true; changed: number } | { ok: false; code: "unavailable" }> {
  const entries = await service
    .from("ai_import_entries")
    .select("id, position, item, draft, source_excerpt, reasons, status")
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId);
  if (entries.error) {
    logged("reading a batch's entries", entries.error);
    return { ok: false, code: "unavailable" };
  }
  const items = await service
    .from("items")
    .select("stem:content->stem->>value")
    .eq("org_id", ref.orgId)
    .limit(WORKSPACE_LIMIT);
  if (items.error) {
    logged("reading the workspace's questions", items.error);
    return { ok: false, code: "unavailable" };
  }
  const stems = (items.data ?? [])
    .map((row) => (row as { stem: unknown }).stem)
    .filter((stem): stem is string => typeof stem === "string");
  const changes = duplicateReasons(
    (entries.data ?? [])
      .filter((row) => row.status !== "dropped")
      .map((row) => ({
        id: row.id,
        position: row.position,
        stem: entryStem(row),
        reasons: row.reasons,
      })),
    stems,
  );
  for (const [id, reasons] of changes) {
    const { error } = await service
      .from("ai_import_entries")
      .update({ reasons })
      .eq("id", id)
      .eq("batch_id", ref.batchId)
      .eq("org_id", ref.orgId);
    if (error) {
      logged("flagging a duplicate", error);
      return { ok: false, code: "unavailable" };
    }
  }
  return { ok: true, changed: changes.size };
}
