// The seeded permutation behind #209's shuffle. A student who reloads must see the same order, so
// nothing here may read the clock or Math.random.
import { describe, expect, it } from "vitest";
import { createRng, permuteWithPinned, seededPermutation } from "./seededRandom";

const draws = (seed: string, count: number) => {
  const next = createRng(seed);
  return Array.from({ length: count }, () => next());
};

describe("createRng", () => {
  it("gives the same stream for the same seed", () => {
    expect(draws("attempt-1:item-1", 50)).toEqual(draws("attempt-1:item-1", 50));
  });

  it("gives different streams for seeds that differ by one character", () => {
    expect(draws("attempt-1:item-1", 5)).not.toEqual(draws("attempt-1:item-2", 5));
  });

  it("stays in [0, 1)", () => {
    for (const value of draws("range", 10_000)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("fills ten buckets evenly (chi-square, df 9, p = 0.001)", () => {
    const buckets = new Array<number>(10).fill(0);
    const total = 20_000;
    for (const value of draws("buckets", total)) buckets[Math.floor(value * 10)] += 1;
    const expected = total / 10;
    const chiSquare = buckets.reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
    expect(chiSquare).toBeLessThan(27.88);
  });

  it("refuses an empty seed, which would give every attempt the same order", () => {
    expect(() => createRng("")).toThrow(/seed/);
  });
});

describe("seededPermutation", () => {
  it("is a permutation of 0..n-1", () => {
    for (const n of [0, 1, 2, 5, 10]) {
      const order = seededPermutation(n, `perm-${n}`);
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });

  it("is deterministic", () => {
    expect(seededPermutation(6, "same")).toEqual(seededPermutation(6, "same"));
  });

  it("reaches many different orders across seeds", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) seen.add(seededPermutation(5, `seed-${i}`).join(","));
    // 120 orders exist; 400 uniform draws miss very few of them.
    expect(seen.size).toBeGreaterThan(100);
  });

  it("puts every index first about equally often", () => {
    const firsts = new Array<number>(4).fill(0);
    const total = 8_000;
    for (let i = 0; i < total; i += 1) firsts[seededPermutation(4, `first-${i}`)[0]] += 1;
    const expected = total / 4;
    const chiSquare = firsts.reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
    expect(chiSquare).toBeLessThan(16.27); // df 3, p = 0.001
  });

  it("rejects a negative or fractional length", () => {
    expect(() => seededPermutation(-1, "x")).toThrow(RangeError);
    expect(() => seededPermutation(1.5, "x")).toThrow(RangeError);
  });
});

describe("permuteWithPinned", () => {
  const list = ["a", "b", "c", "d", "last"] as const;
  const pinLast = (value: string) => value === "last";

  it("keeps a pinned element at its index and permutes the rest among the free slots", () => {
    const orders = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const out = permuteWithPinned(list, `pin-${i}`, pinLast);
      expect(out[4]).toBe("last");
      expect([...out].sort()).toEqual([...list].sort());
      orders.add(out.join(","));
    }
    expect(orders.size).toBeGreaterThan(10);
  });

  it("returns a new array and leaves its input alone", () => {
    const input = Object.freeze(["x", "y", "z"]);
    const out = permuteWithPinned(input, "fresh", () => false);
    expect(out).not.toBe(input);
    expect(input).toEqual(["x", "y", "z"]);
  });

  it("returns the list unchanged in order when everything is pinned", () => {
    expect(permuteWithPinned(list, "all", () => true)).toEqual([...list]);
  });
});
