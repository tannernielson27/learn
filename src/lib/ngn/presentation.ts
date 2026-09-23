import { emptyResponse } from "./results";
import type { AnyResponse, Item } from "./schemas";

/** FNV-1a hash of a string, used to seed the shuffle. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator of floats in [0, 1). */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The order in which to show items a student must arrange. It is the same for a given seed (the
 * item id), so server and client render the same list, and it is never the authored order, which
 * authors usually enter correctly. It never reads the answer key.
 */
export function presentationOrder(ids: readonly string[], seed: string): string[] {
  const shuffled = [...ids];
  if (shuffled.length < 2) return shuffled;
  const next = seededRandom(hash(seed));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const held = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = held;
  }
  const unchanged = shuffled.every((id, i) => id === ids[i]);
  return unchanged ? [...shuffled.slice(1), shuffled[0]!] : shuffled;
}

/**
 * The response a player starts from. It is the empty response, except for ordered response, where
 * the order on screen is already an answer, so the player starts from the presented order.
 */
export function initialResponse(item: Item): AnyResponse {
  if (item.type === "ordered_response") {
    return {
      type: item.type,
      orderedIds: presentationOrder(
        item.content.items.map((step) => step.id),
        item.id,
      ),
    };
  }
  return emptyResponse(item);
}

/**
 * The response a player shows for someone who **did not answer**, once the key is out (#181): a
 * live session's phone that stayed quiet still sees the answer the class is discussing.
 *
 * Nothing chosen, so every element the key names is marked missed and every other is left alone:
 * the key, read off the renderer's own feedback. Ordered response is the exception, because its
 * order on screen is always an answer; the presented order would be marked as a wrong attempt the
 * student never made, so it is laid out in the key's order instead. Reads the key, so it is only
 * ever called with an item whose key has been revealed.
 */
export function unansweredResponse(item: Item): AnyResponse {
  if (item.type === "ordered_response") {
    return { type: item.type, orderedIds: [...item.answerKey.orderedIds] };
  }
  return emptyResponse(item);
}

/**
 * Whether an item is a Trend item: one whose attached record is charted at more than one time,
 * so the panel offers a time selector (docs/01-NGN-ITEM-SPEC.md section 4.2). Trend is a shape an
 * item takes rather than a fifteenth format, so any of the fourteen can be one.
 */
export function isTrendItem(item: Item): boolean {
  return (item.ehr?.timePoints.length ?? 0) > 1;
}
