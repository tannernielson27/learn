import { ITEM_TYPES, ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import type { ItemType } from "@/lib/ngn/schemas";

/**
 * The browser half of AI import's review screen (#346): what each entry's status means, the
 * filters, what blocks the import and how entries group by file.
 *
 * Imported by a Client Component, so it imports nothing from `src/lib/aiImport`
 * (`noClientAiImport.test.ts`). The server reads entries into `ReviewEntryView`s
 * (`src/lib/aiImport/review/read.ts`); a draft never leaves the server.
 */

export type ReviewStatus = "ready" | "needs_answer" | "needs_fix" | "not_importable" | "dropped";

export type ReviewFilter = "all" | ReviewStatus | "duplicate";

export interface ReviewReason {
  code: string;
  message: string;
}

export interface ReviewEntryView {
  id: string;
  /** For the version check: an update says which version it read. */
  version: number;
  /** `file order * 1000 + place in the file` (#343). */
  position: number;
  kind: "item" | "case_study";
  type: ItemType | null;
  status: ReviewStatus;
  reasons: ReviewReason[];
  sourceExcerpt: string;
  /** The learn.v1 item or case study, with its key (a teacher of the workspace only); or null. */
  item: unknown;
  group: { title: string; step: number | null } | null;
}

/** Entries sit at `file order * POSITIONS_PER_FILE + place`; copied from `extractUnit.ts`. */
export const REVIEW_POSITIONS_PER_FILE = 1000;

export const REVIEW_FILTERS: readonly { value: ReviewFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "needs_answer", label: "Needs an answer" },
  { value: "needs_fix", label: "Needs a fix" },
  { value: "not_importable", label: "Not importable" },
  { value: "duplicate", label: "Duplicate" },
  { value: "dropped", label: "Dropped" },
];

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  ready: "Ready",
  needs_answer: "Needs an answer",
  needs_fix: "Needs a fix",
  not_importable: "Not importable",
  dropped: "Dropped",
};

/** Stored reasons are `code: message` (`formatReason` in `src/lib/aiImport/stage.ts`). */
export function readStoredReasons(stored: readonly string[]): ReviewReason[] {
  return stored.map((text) => {
    const at = text.indexOf(": ");
    return at < 0
      ? { code: "note", message: text }
      : { code: text.slice(0, at), message: text.slice(at + 2) };
  });
}

const hasReason = (reasons: readonly ReviewReason[], codes: readonly string[]) =>
  reasons.some((reason) => codes.includes(reason.code));

/** Flagged by `finishExtraction` as the same question as another; the teacher drops one. */
export const isDuplicate = (entry: Pick<ReviewEntryView, "reasons">): boolean =>
  hasReason(entry.reasons, ["duplicate"]);

export function matchesFilter(entry: ReviewEntryView, filter: ReviewFilter): boolean {
  if (filter === "all") return true;
  if (filter === "duplicate") return entry.status !== "dropped" && isDuplicate(entry);
  return entry.status === filter;
}

export function filterCounts(entries: readonly ReviewEntryView[]): Record<ReviewFilter, number> {
  return Object.fromEntries(
    REVIEW_FILTERS.map(({ value }) => [
      value,
      entries.filter((entry) => matchesFilter(entry, value)).length,
    ]),
  ) as Record<ReviewFilter, number>;
}

/** Reasons that keep a question from being imported as it stands (`stage.ts`). */
const FIX_CODES = ["needs_fix", "unmarked_key", "not_in_source", "relies_on_image", "cut_off"];

/**
 * The status a dropped entry goes back to. The table keeps no earlier status, so it is worked out
 * again the way staging decided it: no NGN type, then anything to fix, then a missing key.
 */
export function restoredStatus(entry: {
  kind: "item" | "case_study";
  type: string | null;
  item: unknown;
  reasons: readonly ReviewReason[];
}): Exclude<ReviewStatus, "dropped"> {
  if (entry.kind === "item" && entry.type === null) return "not_importable";
  if (entry.item === null || entry.item === undefined) return "needs_fix";
  if (hasReason(entry.reasons, FIX_CODES)) return "needs_fix";
  if (hasReason(entry.reasons, ["needs_answer"])) return "needs_answer";
  return "ready";
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export interface ImportSummary {
  questions: number;
  caseStudies: number;
  /** The button's words: "Import 3 questions and 1 case study". */
  label: string;
  /** Why the import cannot run yet; empty when nothing blocks it. */
  blockers: string[];
}

function blocker(
  entries: readonly ReviewEntryView[],
  status: "needs_answer" | "needs_fix",
): string | null {
  const count = entries.filter((entry) => entry.status === status).length;
  if (count === 0) return null;
  const allCases = entries
    .filter((entry) => entry.status === status)
    .every((entry) => entry.kind === "case_study");
  const noun = allCases
    ? plural(count, "case study", "case studies")
    : plural(count, "question", "questions");
  const one = count === 1;
  return status === "needs_answer"
    ? `${noun} ${one ? "needs" : "need"} an answer. Add ${one ? "its key" : "their keys"} or drop ${one ? "it" : "them"}.`
    : `${noun} ${one ? "needs" : "need"} a fix. Fix ${one ? "it" : "them"} or drop ${one ? "it" : "them"}.`;
}

/**
 * What "Import" would bring in: every kept entry (not dropped, not "not importable"). It is blocked
 * while any of them needs an answer or a fix, and says why.
 */
export function importSummary(entries: readonly ReviewEntryView[]): ImportSummary {
  const kept = entries.filter(
    (entry) => entry.status !== "dropped" && entry.status !== "not_importable",
  );
  const caseStudies = kept.filter((entry) => entry.kind === "case_study").length;
  const questions = kept.length - caseStudies;
  const parts = [
    questions > 0 || caseStudies === 0 ? plural(questions, "question", "questions") : null,
    caseStudies > 0 ? plural(caseStudies, "case study", "case studies") : null,
  ].filter((part): part is string => part !== null);
  const blockers = [blocker(kept, "needs_answer"), blocker(kept, "needs_fix")].filter(
    (line): line is string => line !== null,
  );
  if (kept.length === 0) blockers.push("Nothing is left to import. Restore a question first.");
  return { questions, caseStudies, label: `Import ${parts.join(" and ")}`, blockers };
}

export interface FileGroup {
  name: string;
  entries: ReviewEntryView[];
}

/** Entries under their file, in upload order and source order; files with none are left out. */
export function groupByFile(
  entries: readonly ReviewEntryView[],
  fileNames: readonly string[],
): FileGroup[] {
  const sorted = [...entries].sort((a, b) => a.position - b.position);
  const named = fileNames.map((name, place) => ({
    name,
    entries: sorted.filter(
      (entry) => Math.floor(entry.position / REVIEW_POSITIONS_PER_FILE) === place,
    ),
  }));
  const orphans = sorted.filter(
    (entry) => Math.floor(entry.position / REVIEW_POSITIONS_PER_FILE) >= fileNames.length,
  );
  return [...named, ...(orphans.length ? [{ name: "Another file", entries: orphans }] : [])].filter(
    (group) => group.entries.length > 0,
  );
}

/** The types a question can be read again as: every NGN type but its own. A case study has none. */
export function retypeChoices(
  entry: Pick<ReviewEntryView, "kind" | "type">,
): { value: ItemType; label: string }[] {
  if (entry.kind !== "item") return [];
  return ITEM_TYPES.filter((type) => type !== entry.type).map((type) => ({
    value: type,
    label: ITEM_TYPE_LABELS[type],
  }));
}
