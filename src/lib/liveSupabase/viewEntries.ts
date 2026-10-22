/**
 * Rows in, a participant's payload out: the one place `POST /api/live/view` turns what the
 * database holds into what a phone may hold (#185, #407).
 *
 * Pure, and deliberately the only door. However the rows were read — one `open_session_view`
 * call, or the item and answer selects it replaced — they arrive here as stored JSON and leave as
 * `PacedItemPayload`s, and nothing reaches a response by any other path:
 *
 *   * every item is validated whole (`fromItemRow`) and then passed through `toKeylessItem`, so
 *     what a phone holds is a `ParticipantItem`, branded so an item with a key cannot be put there
 *     at all (#130). **The rows handed in carry their keys**; that is why they are not forwarded;
 *   * this participant's own answers come back to them (their responses, never a mark);
 *   * the key, the rationale and their own marks come back **only when `reveal` is true**. Before
 *     that the key is not copied off the item, and the marks are not in the rows to begin with:
 *     neither the SQL function nor the selects read them until the host has revealed (ADR 0003).
 *
 * One item or a whole student-paced set is the same work, so both go through here: a room on one
 * item is a set of one, at the position the room is on.
 */
import { runAt, type CaseStudyRun } from "@/lib/live/caseStudyRuns";
import type { StartingOrderSeedFor } from "@/lib/ngn/startingOrder";
import { parseSubmission, revealOf, toKeylessItem, withScoredReveal } from "@/lib/ngn/submit";
import { recordAtStep, stepAtPosition, type EhrRecordView } from "@/lib/ngn/chartReveal";
import type { EhrRecord, Item } from "@/lib/ngn/schemas";
import type { ScoreResult } from "@/lib/ngn/types";
import { fromItemRow, type ItemRow } from "@/lib/supabase/itemRows";
import type { AnsweredPayload, PacedItemPayload, RevealedPayload } from "./wire";

/** One item the room is showing: its row id in `public.items`, and its one-based place. */
export interface WantedItem {
  id: string;
  position: number;
}

/** A row of `session_responses` as far as a view reads it. Stored JSON, so nothing is trusted. */
interface AnswerRow {
  item_position?: unknown;
  response?: unknown;
  submitted_at?: unknown;
  points?: unknown;
  max_points?: unknown;
  model?: unknown;
  breakdown?: unknown;
  groups?: unknown;
  /** The key, rationale and scoring the answer was scored with; only read on reveal. */
  reveal?: unknown;
}

export interface ViewEntriesInput {
  sessionId: string;
  /** The items to show, in the order to show them. */
  wanted: readonly WantedItem[];
  /** Rows of `public.items` with their `id`, keys and all, in any order. */
  items: readonly unknown[];
  /** This participant's own rows of `public.session_responses`, in any order. */
  answers: readonly unknown[];
  reveal: boolean;
  startingOrderSeed: StartingOrderSeedFor;
  /**
   * The case studies a whole-quiz room plays in place (#469). Each of their steps in the set is
   * handed its own case study's chart at that step; a loose question none.
   */
  runs?: readonly CaseStudyRun[];
}

/** `unplayable`: an item the room is on is missing, or its stored JSON no longer validates. */
export type ViewEntriesResult =
  { ok: true; entries: PacedItemPayload[] } | { ok: false; reason: "unplayable" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function viewEntries(input: ViewEntriesInput): ViewEntriesResult {
  // Stored JSON is external input: every item is validated whole before anything is derived.
  const items = new Map<string, Item>();
  for (const row of input.items) {
    if (!isRecord(row) || typeof row.id !== "string") return { ok: false, reason: "unplayable" };
    const stored = fromItemRow(row as unknown as ItemRow);
    if (!stored.ok) return { ok: false, reason: "unplayable" };
    items.set(row.id, stored.value);
  }

  const byPosition = new Map<number, AnswerRow>();
  for (const answer of input.answers) {
    if (isRecord(answer)) byPosition.set(Number(answer.item_position), answer);
  }

  const entries: PacedItemPayload[] = [];
  for (const { id, position } of input.wanted) {
    const item = items.get(id);
    if (item === undefined) return { ok: false, reason: "unplayable" };
    const mine = byPosition.get(position) ?? null;
    const chart = stepRecord(input.runs ?? [], position);
    entries.push({
      position,
      // One starting order per room for an ordered-response item (#219): every phone sees the same.
      item: toKeylessItem(item, input.startingOrderSeed(input.sessionId, item.id)),
      answered: answeredFrom(item, mine),
      revealed: input.reveal ? revealedFrom(item, position, mine) : null,
      ...(chart === undefined ? {} : { record: chart }),
    });
  }
  return { ok: true, entries };
}

/**
 * The patient record a phone in a case-study room may hold (#335): the record the room started
 * with, as it stands at the step the room is on, and nothing a later step brings. A room in its
 * lobby is at step 1. Undefined for a room run from a bank, so its payload is as it always was.
 *
 * A room run from a quiz that plays case studies in place (#469, `runs`) is on a chart only while
 * it is on one of their steps: that case study's record at that step. Anywhere else (a loose
 * question, the lobby, a case study that had no record) it is null, which tells the phone to put
 * the chart away rather than leave the last one up.
 *
 * The one place a live record is cut to its step, for both of its readers: the view route, on
 * `open_session_view` and on the calls it replaced alike, and the play page's first paint. So a
 * phone is handed the same chart for the same step whichever way it asked.
 */
export function roomRecord(
  record: EhrRecord | null,
  position: number | null,
  runs: readonly CaseStudyRun[] = [],
): EhrRecordView | null | undefined {
  if (runs.length > 0) return stepRecord(runs, position) ?? null;
  return record === null ? undefined : recordAtStep(record, stepAtPosition(position));
}

/**
 * A whole-quiz room's chart at one position of its set (#469): the record of the case study whose
 * step it is, cut to that step by `recordAtStep`. Undefined on a loose question, and on a step of
 * a case study that had no record.
 */
export function stepRecord(
  runs: readonly CaseStudyRun[],
  position: number | null,
): EhrRecordView | undefined {
  const place = runAt(runs, position);
  if (place === null || place.run.record === null) return undefined;
  return recordAtStep(place.run.record, place.step);
}

/**
 * Whether this participant has already answered the item, and what they said.
 *
 * Theirs and nobody else's: the rows were read for the participant id the cookie was checked
 * against. It is what they sent and when, and it is not a mark (ADR 0003).
 *
 * The stored response is read back through `parseSubmission` rather than trusted. It was
 * validated on the way in, but stored JSON is external input every time it is read, and an item
 * edited under a running session could leave a response that no longer matches its schema. An
 * unreadable one reads as "not answered here": the server still knows they answered and will
 * still refuse a second answer, and the phone opens the item fresh instead of being handed
 * something a renderer cannot draw. An unparseable timestamp is the same: `NaN` serializes to
 * `null`, which would be an answer that claims never to have been sent.
 */
function answeredFrom(item: Item, row: AnswerRow | null): AnsweredPayload | null {
  if (row === null || typeof row.submitted_at !== "string" || row.submitted_at === "") return null;
  const parsed = parseSubmission({ response: row.response }, item.type);
  if (!parsed.ok) return null;
  const submittedAt = Date.parse(row.submitted_at);
  if (Number.isNaN(submittedAt)) return null;
  return { itemId: item.id, submittedAt, response: parsed.response };
}

/**
 * The key, and this participant's own marks where they answered. Only ever called on reveal.
 *
 * The key is the one their answer was scored with, stored beside the score, so an author's edit
 * since cannot draw a right answer red beside its points. Someone who did not answer, and a row
 * from before the column, get the item's key as it is now (`withScoredReveal`).
 */
function revealedFrom(item: Item, position: number, row: AnswerRow | null): RevealedPayload {
  const score: ScoreResult | null =
    row === null
      ? null
      : {
          points: Number(row.points),
          maxPoints: Number(row.max_points),
          model: row.model as ScoreResult["model"],
          breakdown: (row.breakdown ?? []) as ScoreResult["breakdown"],
          ...(row.groups == null ? {} : { groups: row.groups as ScoreResult["groups"] }),
        };
  return {
    itemId: item.id,
    position,
    reveal: revealOf(withScoredReveal(item, row?.reveal)),
    score,
  };
}
