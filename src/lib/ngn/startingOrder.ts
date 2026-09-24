/**
 * The order an ordered-response item's steps start in (#219).
 *
 * Authors type the steps in their correct order, so the authored order is usually the key, and a
 * player that started there would hand out the answer. The steps are scrambled instead, with a
 * seeded permutation, and a scramble that lands on the key is rotated one place, so for two or
 * more steps the starting order is **never** the key, for any seed.
 *
 * It reads the key, so it runs where the key is: on the server, before `toKeylessItem` sends the
 * item (the keyless item then lists its steps in this order and the player starts from them as
 * they come), or in a browser that already holds the whole item (the gallery, an author's
 * preview). Scoring reads the response's ids against the key, never positions in `content`, so
 * reordering the steps changes no score. Pure TypeScript (ADR 0001).
 */
import type { Item } from "./schemas";

/** FNV-1a hash of a string, used to seed the scramble. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32: a small seeded generator of floats in [0, 1). Kept from the player's earlier
 * scramble rather than swapped for `seededRandom.ts`, so the order every existing gallery
 * screenshot and author preview shows does not move.
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A Fisher–Yates scramble of `ids`, fixed by `seed`. The input is never changed. */
function scramble(ids: readonly string[], seed: string): string[] {
  const shuffled = [...ids];
  const next = seededRandom(hash(seed));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const held = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = held;
  }
  return shuffled;
}

const sameOrder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * The steps' starting order: a seeded scramble of `ids` that is never `key` when there are two
 * or more of them. Rotating a list of distinct ids by one place always changes it, so a scramble
 * that lands on the key is rotated; with two steps that is the one other order.
 */
export function startingOrder(
  ids: readonly string[],
  key: readonly string[],
  seed: string,
): string[] {
  if (ids.length < 2) return [...ids];
  const shuffled = scramble(ids, seed);
  return sameOrder(shuffled, key) ? [...shuffled.slice(1), shuffled[0]!] : shuffled;
}

/** Turns a room or an attempt and an item into a seed. The server's is keyed with a secret. */
export type StartingOrderSeedFor = (scopeId: string, itemId: string) => string;

/**
 * The seed for one item in one live session (every phone in the room starts from the same order)
 * or one take-home attempt (a reload or a resume starts from the same order again).
 */
export function startingOrderSeed(scopeId: string, itemId: string): string {
  return `${scopeId}:${itemId}`;
}

/**
 * A new item whose ordered-response steps are listed in their starting order. Every other type
 * comes back as it was given. The item it is given is never changed.
 */
export function withStartingOrder(item: Item, seed: string): Item {
  if (item.type !== "ordered_response") return item;
  const byId = new Map(item.content.items.map((step) => [step.id, step]));
  const order = startingOrder(
    item.content.items.map((step) => step.id),
    item.answerKey.orderedIds,
    seed,
  );
  return {
    ...item,
    content: { ...item.content, items: order.map((id) => byId.get(id)!) },
  };
}
