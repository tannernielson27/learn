import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { removedPlaces, withoutRemoved } from "./places";
import { normalizePassage, openingKey } from "./sourceText";
import { formatReason, readReason, type EntryReason } from "./stage";

/**
 * Duplicates (#343): the same question twice in one batch (a document uploaded as both .pdf and
 * .docx), or a question the workspace already has in a quiz. Each is told apart by a hash of its
 * stem, normalized as `normalizePassage` does (case, markup, punctuation and spacing ignored).
 * A duplicate is flagged for the reviewer, never dropped: they decide.
 *
 * Run once a batch's units are all extracted (#345), and again whenever that is not certain: it
 * replaces the `duplicate` reasons it wrote before, so running it twice changes nothing.
 *
 * During review the flags within the batch are worked out again after each drop, restore, save
 * and split (#593, `refreshBatchDuplicates`): dropping the earlier copy used to leave the later one
 * flagged, and an edited stem kept its flag. The comparison with the workspace's quizzes stays as
 * it was computed, since nothing a teacher does in review changes the quizzes.
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

/**
 * The stem an entry is compared by. One with no stem (a case study, a question with no NGN type)
 * is told apart by its opening words, as the pipeline itself tells questions apart
 * (`openingKey`). Since #593 `source_excerpt` holds the question's whole part of a text document
 * and only the opening for a PDF, and both begin with the same words, so the same question in a
 * .pdf and a .docx still matches. A case study keeps its first step's opening on its draft.
 */
export function entryStem(row: { item: unknown; draft: unknown; source_excerpt: string }): string {
  return (
    stringAt(row.item, "stem", "value") ??
    stringAt(row.draft, "stem") ??
    openingKey(stringAt(row.draft, "opening") ?? row.source_excerpt)
  );
}

export interface BatchCopy {
  id: string;
  position: number;
  /** Null when the entry has no stem to compare; it is then left exactly as it is. */
  stem: string | null;
  reasons: string[];
}

const IN_BATCH_STORED = formatReason(IN_BATCH);

/**
 * The reasons each kept entry should have once the flags within the batch are worked out again,
 * by id, for the entries whose reasons change. Every other reason keeps its place, the flag for
 * the workspace's quizzes included.
 */
export function batchDuplicateReasons(entries: readonly BatchCopy[]): Map<string, string[]> {
  const seen = new Set<string>();
  const changes = new Map<string, string[]>();
  for (const entry of [...entries].sort((a, b) => a.position - b.position)) {
    const hash = entry.stem === null ? null : stemHash(entry.stem);
    if (hash === null) continue;
    const kept = entry.reasons.filter((reason) => reason !== IN_BATCH_STORED);
    const next = (seen.has(hash) ? [...kept, IN_BATCH_STORED] : kept).slice(0, 20);
    seen.add(hash);
    if (next.length !== entry.reasons.length || next.some((r, i) => r !== entry.reasons[i])) {
      changes.set(entry.id, next);
    }
  }
  return changes;
}

/** At most this many of the workspace's questions are compared; a larger library is cut off. */
const WORKSPACE_LIMIT = 5_000;

const logged = (step: string, error: { code?: string } | null) => {
  console.error(`[ai-import] ${step} failed`, { code: error?.code ?? null });
};

/**
 * Flags a batch's duplicates, on the service-role client. Returns how many entries changed.
 * `removed` holds the places of files the teacher removed (#591): an entry staged late at one of
 * them is not part of the import, so it neither is flagged nor makes another question a duplicate.
 */
export async function markDuplicates(
  service: Client,
  ref: { orgId: string; batchId: string },
  removed: ReadonlySet<number> = new Set(),
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
    withoutRemoved(entries.data ?? [], removed)
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

/**
 * Works out the batch's own duplicate flags again (#593), on the service-role client, since a
 * teacher's session may not write `reasons`. Stems are read, never a whole item; an entry with
 * no stem (a question with no NGN type, a case study staged before #593) is told apart by the
 * opening of its source, read for those entries only.
 *
 * Each write names the version it read: a save or a change of type that lands in between has
 * newer reasons, and an entry that has moved on is left to the next pass, never written back.
 * Entries that end with the same reasons share one statement. Each rewritten entry's version
 * goes up by one; the new versions come back by id, so a caller that has just written one of
 * them can answer with the version that now stands.
 */
export async function refreshBatchDuplicates(
  service: Client,
  ref: { orgId: string; batchId: string },
): Promise<{ ok: true; versions: Map<string, number> } | { ok: false; code: "unavailable" }> {
  const [entries, files] = await Promise.all([
    service
      .from("ai_import_entries")
      .select(
        "id, version, position, status, reasons, stem:item->stem->>value, draftStem:draft->>stem, opening:draft->>opening",
      )
      .eq("batch_id", ref.batchId)
      .eq("org_id", ref.orgId),
    service
      .from("ai_import_files")
      .select("status, rejected_reason")
      .eq("batch_id", ref.batchId)
      .eq("org_id", ref.orgId)
      .order("created_at")
      .order("id"),
  ]);
  const error = entries.error ?? files.error;
  if (error) {
    logged("reading a batch's stems", error);
    return { ok: false, code: "unavailable" };
  }
  const kept = withoutRemoved(
    (entries.data ?? []) as unknown as StemRow[],
    removedPlaces(files.data ?? []),
  ).filter((row) => row.status !== "dropped");
  const openings = await sourceOpenings(
    service,
    ref,
    kept.filter((row) => stemOf(row) === null).map((row) => row.id),
  );
  if (openings === "unavailable") return { ok: false, code: "unavailable" };

  const changes = batchDuplicateReasons(
    kept.map((row) => ({
      id: row.id,
      position: row.position,
      stem: stemOf(row) ?? openings.get(row.id) ?? null,
      reasons: row.reasons ?? [],
    })),
  );
  const shown = new Map(kept.map((row) => [row.id, row.version]));
  const versions = new Map<string, number>();
  for (const [reasons, ids] of sameReasons(changes)) {
    for (let start = 0; start < ids.length; start += WRITE_CHUNK) {
      const { data, error: writeError } = await service
        .from("ai_import_entries")
        .update({ reasons })
        .eq("batch_id", ref.batchId)
        .eq("org_id", ref.orgId)
        // Ids and versions as the database gave them: a UUID and a whole number each.
        .or(
          ids
            .slice(start, start + WRITE_CHUNK)
            .map((id) => `and(id.eq.${id},version.eq.${shown.get(id)})`)
            .join(","),
        )
        .select("id, version");
      if (writeError) {
        logged("flagging a duplicate", writeError);
        return { ok: false, code: "unavailable" };
      }
      // An entry not answered here changed since the read, and keeps what it has.
      for (const written of (data ?? []) as { id: string; version: number }[]) {
        versions.set(written.id, written.version);
      }
    }
  }
  return { ok: true, versions };
}

interface StemRow {
  id: string;
  version: number;
  position: number;
  status: string;
  reasons: string[] | null;
  stem: unknown;
  draftStem: unknown;
  opening: unknown;
}

/** How many entries one write names; a longer filter would not fit in a request line. */
const WRITE_CHUNK = 30;

const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

/** What `entryStem` compares by, from the columns read here; null when the source must say. */
function stemOf(row: StemRow): string | null {
  const opening = text(row.opening);
  return text(row.stem) ?? text(row.draftStem) ?? (opening === null ? null : openingKey(opening));
}

/** The opening words of each entry's source, by id, for entries that have no stem to compare. */
async function sourceOpenings(
  service: Client,
  ref: { orgId: string; batchId: string },
  ids: readonly string[],
): Promise<Map<string, string> | "unavailable"> {
  if (ids.length === 0) return new Map();
  const { data, error } = await service
    .from("ai_import_entries")
    .select("id, source_excerpt")
    .eq("batch_id", ref.batchId)
    .eq("org_id", ref.orgId)
    .in("id", [...ids]);
  if (error) {
    logged("reading a batch's sources", error);
    return "unavailable";
  }
  return new Map(
    ((data ?? []) as { id: string; source_excerpt: string | null }[]).flatMap((row) => {
      const opening = openingKey(row.source_excerpt ?? "");
      return opening === "" ? [] : [[row.id, opening] as const];
    }),
  );
}

/** The entries to rewrite, grouped by what their reasons become: one statement for each group. */
function sameReasons(changes: ReadonlyMap<string, string[]>): [string[], string[]][] {
  const groups = new Map<string, { reasons: string[]; ids: string[] }>();
  for (const [id, reasons] of changes) {
    const key = JSON.stringify(reasons);
    const group = groups.get(key) ?? { reasons, ids: [] };
    groups.set(key, { reasons: group.reasons, ids: [...group.ids, id] });
  }
  return [...groups.values()].map((group) => [group.reasons, group.ids]);
}
