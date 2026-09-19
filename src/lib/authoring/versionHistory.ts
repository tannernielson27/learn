// An item's published versions as its History panel shows them: each snapshot read again as
// external input, and a plain summary of how it differs from the saved draft. Snapshots hold the
// answer key, so everything here belongs to the authoring area only.
import { SCORING_MODEL_LABELS } from "@/lib/ngn/labels";
import type { Item } from "@/lib/ngn/schemas";
import type { ScoringModel } from "@/lib/ngn/types";
import { validateItem } from "@/lib/ngn/validate";

/** The most versions the panel lists, newest first. */
export const HISTORY_LIMIT = 50;

export const NO_CHANGES = "Same as the saved draft.";

const INVALID =
  "This version no longer matches the current question format, so it can be read here but not restored.";
const OTHER_TYPE = "This version is a different kind of question, so it cannot be restored here.";

/** An item_versions row as the editor page selects it. */
export interface VersionRow {
  version: number;
  created_at: string;
  snapshot: unknown;
}

export type HistoryVersion =
  | { version: number; publishedAt: string; ok: true; item: Item }
  | { version: number; publishedAt: string; ok: false; snapshot: unknown; reason: string };

/**
 * Validates a stored snapshot again: the schemas may have moved on since it was published. One that
 * no longer validates, or is of another type, can be read but never restored.
 */
export function readVersion(row: VersionRow, type: string): HistoryVersion {
  const base = { version: row.version, publishedAt: row.created_at };
  const result = validateItem(row.snapshot);
  if (!result.ok) return { ...base, ok: false, snapshot: row.snapshot, reason: INVALID };
  if (result.value.type !== type) {
    return { ...base, ok: false, snapshot: row.snapshot, reason: OTHER_TYPE };
  }
  return { ...base, ok: true, item: result.value };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Deep equality for stored JSON. Key order is ignored (jsonb does not keep it) and a missing value,
 * undefined and null are the same thing, as they are once an item is stored.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null || b === undefined || b === null) {
    return (a ?? null) === (b ?? null);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => sameJson(value, b[index]));
  }
  if (isRecord(a) && isRecord(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((key) => sameJson(a[key], b[key]));
  }
  return a === b;
}

// The parts an author recognises, in the order the editor shows them. "Options" is the type's own
// content: choices, rows, blanks or steps.
const PARTS: readonly { key: string; label: string }[] = [
  { key: "stem", label: "stem" },
  { key: "instructions", label: "instructions" },
  { key: "content", label: "options" },
  { key: "answerKey", label: "answer key" },
  { key: "rationale", label: "rationale" },
  { key: "ehr", label: "patient record" },
  { key: "tags", label: "tags" },
];

const points = (count: number) => `${count} ${count === 1 ? "point" : "points"}`;

function describeScoring(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const { model, maxPoints } = value;
  if (typeof model !== "string" || !(model in SCORING_MODEL_LABELS)) return null;
  if (typeof maxPoints !== "number") return null;
  return `${points(maxPoints)} with ${SCORING_MODEL_LABELS[model as ScoringModel].name}`;
}

function scoringChange(version: unknown, draft: unknown): string {
  const then = describeScoring(version);
  const now = describeScoring(draft);
  if (!then || !now) return "The scoring changed.";
  return `The scoring changed: this version is worth ${then}; the draft is worth ${now}.`;
}

/**
 * What differs between a version and the saved draft, one sentence per part, rationale included
 * but never compared word by word. Empty when they match.
 */
export function summarizeChanges(version: unknown, draft: unknown): string[] {
  const then = isRecord(version) ? version : {};
  const now = isRecord(draft) ? draft : {};
  const changes = PARTS.filter(({ key }) => !sameJson(then[key], now[key])).map(
    ({ label }) => `The ${label} changed.`,
  );
  // Scoring reads best last, after the parts that decide it.
  if (!sameJson(then.scoring, now.scoring)) changes.push(scoringChange(then.scoring, now.scoring));
  return changes;
}

// Pinned to UTC so a date renders the same on the server and in any browser.
const PUBLISHED_DATE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export function formatPublished(iso: string): string {
  return `Published ${PUBLISHED_DATE.format(new Date(iso))}`;
}
