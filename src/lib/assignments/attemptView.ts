/**
 * What a student's browser is handed for one attempt (#208): the assignment's items, keyless, in
 * the set's order, each with the answer this attempt last saved for it.
 *
 * Built on the server from items read with their keys, so the key is taken off here, before
 * anything is serialized: every item goes through `toKeylessItem` (ADR 0003, #144), and only then,
 * when the assignment shuffles, through `shuffleItem` with a seed fixed per attempt and item (#209)
 * — so a resume on another device shows the same order, and two students see different ones.
 * Answers are keyed by option id, never by position, so the shuffle changes nothing the server
 * scores.
 *
 * A saved answer is read back through `parseSubmission`: one that no longer parses opens blank
 * rather than breaking the item.
 */
import type { AnyResponse } from "@/lib/ngn/schemas";
import { shuffleItem, shuffleSeed } from "@/lib/ngn/shuffle";
import { startingOrderSeed } from "@/lib/ngn/startingOrder";
import { parseSubmission, toKeylessItem, type KeylessItem } from "@/lib/ngn/submit";
import type { SetItem } from "./attemptScoring";

/** One item of an attempt, as the student's browser holds it. */
export interface AttemptItemPayload {
  /** The item's row id: what a save names it by. Already in the student's `item_set`. */
  itemId: string;
  /** One-based place in the set. */
  position: number;
  item: KeylessItem;
  /** What this attempt last saved for the item, or null. Their own answer, never a mark. */
  saved: AnyResponse | null;
}

export interface AttemptSetInput {
  set: readonly SetItem[];
  attemptId: string;
  shuffle: boolean;
  answers: Readonly<Record<string, unknown>>;
}

function keylessFor(entry: SetItem, attemptId: string, shuffle: boolean): KeylessItem {
  // Ordered-response steps start scrambled whether or not the assignment shuffles (#219): their
  // authored order is usually the key. Seeded by attempt, so a resume starts from the same order.
  const keyless = toKeylessItem(entry.item, startingOrderSeed(attemptId, entry.item.id));
  if (!shuffle) return keyless;
  try {
    return shuffleItem(keyless, shuffleSeed(attemptId, keyless.id));
  } catch {
    // An id outside the seed alphabet cannot be seeded; the author's order gives nothing away.
    return keyless;
  }
}

function savedFor(entry: SetItem, answers: Readonly<Record<string, unknown>>): AnyResponse | null {
  if (!Object.hasOwn(answers, entry.rowId)) return null;
  const parsed = parseSubmission({ response: answers[entry.rowId] }, entry.item.type);
  return parsed.ok ? parsed.response : null;
}

/** The attempt's set, keyless and (when the assignment says so) shuffled, with saved answers. */
export function buildAttemptSet({
  set,
  attemptId,
  shuffle,
  answers,
}: AttemptSetInput): AttemptItemPayload[] {
  return set.map((entry, index) => ({
    itemId: entry.rowId,
    position: index + 1,
    item: keylessFor(entry, attemptId, shuffle),
    saved: savedFor(entry, answers),
  }));
}
