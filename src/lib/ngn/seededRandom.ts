/**
 * A small seeded random stream and the permutations built on it (#209).
 *
 * The shuffle must give one attempt the same order every time it is built, on any server and after
 * any reload, so nothing here reads Math.random or the clock: the order is a pure function of the
 * seed string. Not for anything secret — it hides an answer's position from a neighbour's screen,
 * not from someone who knows the seed, and the seed never reaches the browser.
 *
 * cyrb128 hashes the string into 128 bits; sfc32 (Chris Doty-Humphrey's Small Fast Counter)
 * turns them into a stream. Both are public-domain, well-studied and a few lines each.
 */

/** Four 32-bit words from a string. Every character reaches every word. */
function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i += 1) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Numbers in [0, 1), the same sequence every time for the same seed. */
export function createRng(seed: string): () => number {
  if (seed.length === 0) {
    throw new Error("a shuffle seed is required; an empty one would give every attempt one order");
  }
  let [a, b, c, d] = cyrb128(seed);
  const next = () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  // The first few outputs of sfc32 lean on the raw hash; discarding them is the usual warm-up.
  for (let i = 0; i < 12; i += 1) next();
  return next;
}

/** A uniformly random order of 0..length-1 (Fisher–Yates), fixed by the seed. */
export function seededPermutation(length: number, seed: string): number[] {
  if (!Number.isInteger(length) || length < 0) {
    throw new RangeError(`a permutation needs a whole, non-negative length, not ${length}`);
  }
  const next = createRng(seed);
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * A new array with the elements `isPinned` accepts left at their own index and every other element
 * permuted among the remaining slots. The input is never changed.
 */
export function permuteWithPinned<T>(
  list: readonly T[],
  seed: string,
  isPinned: (value: T) => boolean,
): T[] {
  const freeSlots = list.flatMap((value, index) => (isPinned(value) ? [] : [index]));
  const order = seededPermutation(freeSlots.length, seed);
  const placed = new Map(freeSlots.map((slot, k) => [slot, list[freeSlots[order[k]]]]));
  return list.map((value, index) => (placed.has(index) ? (placed.get(index) as T) : value));
}
