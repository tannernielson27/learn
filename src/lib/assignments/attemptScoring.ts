/**
 * Scoring one attempt at an assignment (#208), on the server.
 *
 * Every saved answer is read back through `parseSubmission` and scored through `scoreSubmission`,
 * the one scoring entry point (ADR 0003), so an item scores the same way here as in a live session,
 * the authoring preview or the gallery. An item with no saved answer earns nothing and counts in
 * the maximum. An answer that no longer parses, is for another item type, or names elements the
 * item does not have (a script writing straight to the save function) also earns nothing: it is
 * scored as unanswered, never as an error that would leave the attempt unsubmittable.
 *
 * Server only: this module reaches the scoring engine, which a student's bundle must not.
 */
import { maxPoints } from "@/lib/ngn/scoring";
import type { Item } from "@/lib/ngn/schemas";
import { parseSubmission, scoreSubmission } from "@/lib/ngn/submit";
import type { ScoreResult } from "@/lib/ngn/types";

/** One item of an assignment's set: its row id (what `attempt_responses.item_id` holds) and itself. */
export interface SetItem {
  rowId: string;
  item: Item;
}

/** One saved answer's mark, in the shape `record_attempt_submission` writes. */
export interface AttemptMark {
  item_id: string;
  points: number;
  max_points: number;
  model: string;
  breakdown: unknown[];
  groups: unknown[] | null;
}

export interface AttemptScore {
  total: number;
  possible: number;
  /** One per saved answer; an item with nothing saved has no row to mark. */
  marks: AttemptMark[];
}

/** Two decimals, as `numeric(8, 2)` stores them, without a float's tail. */
const cents = (value: number): number => Math.round(value * 100) / 100;

/** What a saved answer earned, or null for one that cannot be scored at all. */
function scoreSaved(item: Item, saved: unknown): ScoreResult | null {
  const parsed = parseSubmission({ response: saved }, item.type);
  if (!parsed.ok) return null;
  try {
    return scoreSubmission(item, parsed.response).score;
  } catch {
    return null;
  }
}

function markOf(entry: SetItem, saved: unknown): AttemptMark {
  const possible = maxPoints(entry.item);
  const score = scoreSaved(entry.item, saved);
  return {
    item_id: entry.rowId,
    points: score === null ? 0 : cents(score.points),
    max_points: score === null ? possible : cents(score.maxPoints),
    model: score === null ? entry.item.scoring.model : score.model,
    breakdown: score === null ? [] : [...score.breakdown],
    groups: score?.groups ? [...score.groups] : null,
  };
}

/**
 * The total, the maximum and a mark per saved answer. `answers` is keyed by row id, as
 * `begin_attempt_submission` and `expired_open_attempts` hand it over; keys not in the set are
 * ignored. Nothing it is given is changed.
 */
export function scoreAttempt(
  set: readonly SetItem[],
  answers: Readonly<Record<string, unknown>>,
): AttemptScore {
  const marks = set
    .filter((entry) => Object.hasOwn(answers, entry.rowId))
    .map((entry) => markOf(entry, answers[entry.rowId]));
  const marked = new Map(marks.map((mark) => [mark.item_id, mark]));
  const possible = set.reduce(
    (sum, entry) => sum + (marked.get(entry.rowId)?.max_points ?? maxPoints(entry.item)),
    0,
  );
  const total = marks.reduce((sum, mark) => sum + mark.points, 0);
  return { total: cents(total), possible: cents(possible), marks };
}
