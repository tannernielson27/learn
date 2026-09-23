import { describe, expect, it } from "vitest";
import { allFixtures } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { concealKey, percentOf, shareOf } from "./conceal";
import { distributionFor } from "./index";
import type { Distribution } from "./types";

/** Every `correct` flag in a distribution, wherever it sits. */
function flags(value: unknown): boolean[] {
  const found: boolean[] = [];
  JSON.stringify(value, (key, inner: unknown) => {
    if (key === "correct" && typeof inner === "boolean") found.push(inner);
    return inner;
  });
  return found;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** Each fixture's canonical item, answered by every scoring case it documents. */
const answered = allFixtures.map((fixture) => {
  const item = itemSchema.parse(fixture.canonical) as Item;
  return {
    name: fixture.type,
    distribution: distributionFor(
      item,
      fixture.cases.map((sample) => sample.response),
    ),
  };
});

describe("concealKey", () => {
  it.each(answered)("$name: the key is there to hide in the first place", ({ distribution }) => {
    expect(flags(distribution)).toContain(true);
  });

  it.each(answered)("$name: marks no choice correct", ({ distribution }) => {
    const hidden = concealKey(deepFreeze(distribution));
    expect(flags(hidden)).not.toContain(true);
    // Still flagged, just all false: the shape a component reads is the same shape.
    expect(flags(hidden).length).toBeGreaterThan(0);
  });

  it.each(answered)("$name: keeps every count", ({ distribution }) => {
    const counts = (value: Distribution) =>
      JSON.stringify(value, (key, inner: unknown) =>
        key === "correct" || key === "commonWrong" || key === "exact" || key === "allCorrect"
          ? undefined
          : inner,
      );
    expect(counts(concealKey(distribution))).toBe(counts(distribution));
  });

  it("drops what only the key could say: the wrong combinations and the all-correct counts", () => {
    const pairs = answered.find(({ name }) => name === "dropdown_rationale")?.distribution;
    const order = answered.find(({ name }) => name === "ordered_response")?.distribution;
    expect(pairs).toMatchObject({ kind: "pairs" });
    expect(order).toMatchObject({ kind: "order" });
    const hiddenPairs = concealKey(pairs as Distribution);
    const hiddenOrder = concealKey(order as Distribution);
    expect(hiddenPairs).toMatchObject({ commonWrong: [], allCorrect: 0 });
    expect(hiddenOrder).toMatchObject({ exact: 0 });
    // And the originals are untouched.
    expect((pairs as { commonWrong: unknown[] }).commonWrong.length).toBeGreaterThan(0);
  });
});

describe("percentOf and shareOf", () => {
  it("rounds a share of the room to a whole percent", () => {
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(3, 3)).toBe(100);
    expect(percentOf(0, 3)).toBe(0);
  });

  it("says nought, not NaN, for a room nobody has answered", () => {
    expect(percentOf(0, 0)).toBe(0);
    expect(shareOf(0, 0)).toBe(0);
  });

  it("gives a bar its length between nought and one", () => {
    expect(shareOf(1, 4)).toBe(0.25);
    expect(shareOf(4, 4)).toBe(1);
    // A count can never exceed the room, but a bar must not overflow if one ever did.
    expect(shareOf(5, 4)).toBe(1);
    expect(shareOf(-1, 4)).toBe(0);
  });
});
