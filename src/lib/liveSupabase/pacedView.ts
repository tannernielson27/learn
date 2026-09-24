/**
 * The student-paced half of `POST /api/live/view` (#185): the whole set, as one participant may
 * see it right now.
 *
 * The same bargain `viewRoute.ts` keeps for one item, kept for every item at once. Each item is
 * read under the service role and passed through `toKeylessItem` before anything is serialized,
 * so what a phone holds is a `ParticipantItem` — branded so an item with a key cannot be put here
 * at all. This participant's own answers come back to them (their responses, never a mark), and
 * the keys, the rationales and their own marks come back **only when `reveal` is true**: the
 * columns that hold marks are not even selected before then, and the key is not copied off the
 * item. "Show answers" is the host's one switch for the whole set (the owner's decision), so it is
 * the one flag this reads.
 *
 * Two reads, however long the set: the items by id, and this participant's answers by session.
 */
import { startingOrderSeed } from "@/lib/ngn/startingOrder";
import { parseSubmission, toKeylessItem } from "@/lib/ngn/submit";
import type { Item } from "@/lib/ngn/schemas";
import type { ScoreResult } from "@/lib/ngn/types";
import { fromItemRow } from "@/lib/supabase/itemRows";
import type { LiveRouteDeps } from "./routeDeps";
import type { AnsweredPayload, PacedItemPayload, RevealedPayload } from "./wire";

const ITEM_COLUMNS = "id, type, cjmm_step, tags, version, content, answer_key, rationale, scoring";
/** What a participant may have read back before the reveal: what they sent, and when. */
const ANSWER_COLUMNS = "item_position, response, submitted_at";
/** And after it, their own marks too. */
const MARKED_COLUMNS = `${ANSWER_COLUMNS}, points, max_points, model, breakdown, groups`;

interface AnswerRow {
  item_position: number;
  response: unknown;
  submitted_at: string | null;
  points?: number | string | null;
  max_points?: number | string | null;
  model?: string | null;
  breakdown?: unknown;
  groups?: unknown;
}

/** Why the set could not be read: the database failed, or an item in it will not parse. */
export type PacedSetResult =
  { ok: true; set: PacedItemPayload[] } | { ok: false; reason: "failed" | "unplayable" };

export async function readPacedSet(
  deps: LiveRouteDeps,
  participant: { sessionId: string; participantId: string },
  itemIds: readonly string[],
  reveal: boolean,
): Promise<PacedSetResult> {
  const { data: rows, error } = await deps.service
    .from("items")
    .select(ITEM_COLUMNS)
    .in("id", [...itemIds]);
  if (error) return { ok: false, reason: "failed" };

  // Stored JSON is external input: every item is validated whole before anything is derived.
  const items = new Map<string, Item>();
  for (const row of rows ?? []) {
    const stored = fromItemRow(row);
    if (!stored.ok) return { ok: false, reason: "unplayable" };
    items.set(row.id, stored.value);
  }
  const ordered = itemIds.map((id) => items.get(id));
  if (ordered.some((item) => item === undefined)) return { ok: false, reason: "unplayable" };

  const { data: answers, error: answerError } = await deps.service
    .from("session_responses")
    .select(reveal ? MARKED_COLUMNS : ANSWER_COLUMNS)
    .eq("session_id", participant.sessionId)
    .eq("participant_id", participant.participantId);
  if (answerError) return { ok: false, reason: "failed" };
  const byPosition = new Map<number, AnswerRow>();
  for (const answer of (answers ?? []) as unknown as AnswerRow[]) {
    byPosition.set(Number(answer.item_position), answer);
  }

  const set = (ordered as Item[]).map((item, index): PacedItemPayload => {
    const position = index + 1;
    const mine = byPosition.get(position) ?? null;
    return {
      position,
      // One starting order per room for an ordered-response item (#219).
      item: toKeylessItem(item, startingOrderSeed(participant.sessionId, item.id)),
      answered: answeredFrom(item, mine),
      revealed: reveal ? revealedFrom(item, position, mine) : null,
    };
  });
  return { ok: true, set };
}

/**
 * Their own answer, read back through `parseSubmission` like the one-item route does: an answer
 * that no longer parses reads as "not answered here", and the server still refuses a second one.
 */
function answeredFrom(item: Item, row: AnswerRow | null): AnsweredPayload | null {
  if (row === null || !row.submitted_at) return null;
  const parsed = parseSubmission({ response: row.response }, item.type);
  if (!parsed.ok) return null;
  const submittedAt = Date.parse(row.submitted_at);
  if (Number.isNaN(submittedAt)) return null;
  return { itemId: item.id, submittedAt, response: parsed.response };
}

/** The key, and this participant's own marks where they answered. Only ever called on reveal. */
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
    reveal: { answerKey: item.answerKey, rationale: item.rationale, scoring: item.scoring },
    score,
  };
}
