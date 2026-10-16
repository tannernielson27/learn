import { importRowsFor, type ImportRows } from "@/lib/authoring/transfer";
import { withinItemSizeLimit } from "@/lib/authoring/payloadSize";
import { caseStudySchema, itemSchema } from "@/lib/ngn/schemas";
import type { ItemRow } from "@/lib/supabase/itemRows";

/**
 * What the import (#348) hands the database: every kept entry of the batch, validated again with
 * the learn.v1 schemas here, on the server, as the JSON import does. A teacher's "ready" is a
 * request, not a proof (#340), and `public.import_ai_batch` checks the same lines again for any
 * caller: the entries handed in must be exactly the kept ones, at the versions read here.
 */

export interface CommitEntryRow {
  id: string;
  version: number;
  position: number;
  kind: string;
  status: string;
  item: unknown;
}

export const COMMIT_ENTRY_COLUMNS = "id, version, position, kind, status, item";

type CaseStudyRows = NonNullable<ImportRows["caseStudy"]>;

export type CommitEntry =
  | { id: string; version: number; item: ItemRow }
  | { id: string; version: number; case_study: CaseStudyRows };

export type CommitPlan =
  | { ok: true; entries: CommitEntry[]; questions: number; caseStudies: number }
  | { ok: false; code: "not_ready" | "invalid_entry" | "nothing_to_import" };

/** Kept: neither dropped by the teacher nor marked "not importable" by the pipeline. */
const isKept = (row: CommitEntryRow) => row.status !== "dropped" && row.status !== "not_importable";

function toEntry(row: CommitEntryRow): CommitEntry | null {
  if (!withinItemSizeLimit(row.item)) return null;
  if (row.kind === "case_study") {
    const parsed = caseStudySchema.safeParse(row.item);
    if (!parsed.success) return null;
    const rows = importRowsFor({ ok: true, kind: "caseStudy", caseStudy: parsed.data });
    return rows.caseStudy ? { id: row.id, version: row.version, case_study: rows.caseStudy } : null;
  }
  const parsed = itemSchema.safeParse(row.item);
  if (!parsed.success) return null;
  const [item] = importRowsFor({ ok: true, kind: "items", items: [parsed.data] }).items;
  return item ? { id: row.id, version: row.version, item } : null;
}

export function planCommit(rows: readonly CommitEntryRow[]): CommitPlan {
  const kept = rows.filter(isKept).sort((a, b) => a.position - b.position);
  if (kept.length === 0) return { ok: false, code: "nothing_to_import" };
  if (kept.some((row) => row.status !== "ready" || row.item === null || row.item === undefined)) {
    return { ok: false, code: "not_ready" };
  }
  const entries: CommitEntry[] = [];
  for (const row of kept) {
    const entry = toEntry(row);
    if (!entry) return { ok: false, code: "invalid_entry" };
    entries.push(entry);
  }
  const caseStudies = entries.filter((entry) => "case_study" in entry).length;
  return { ok: true, entries, questions: entries.length - caseStudies, caseStudies };
}
