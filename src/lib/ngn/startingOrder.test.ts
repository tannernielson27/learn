import { describe, expect, it } from "vitest";
import { FIXTURES, allFixtures } from "./fixtures";
import { itemSchema, type Item } from "./schemas";
import { scoreItem } from "./scoring";
import { startingOrder, startingOrderSeed, withStartingOrder } from "./startingOrder";

const ids = ["a", "b", "c", "d", "e"];

/** Every order of a list, for the lengths an ordered-response item can have and a few more. */
function permutations(list: readonly string[]): string[][] {
  if (list.length <= 1) return [[...list]];
  return list.flatMap((head, i) =>
    permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [head, ...rest]),
  );
}

function orderedFixture(): Extract<Item, { type: "ordered_response" }> {
  const item = itemSchema.parse(FIXTURES.ordered_response.canonical);
  if (item.type !== "ordered_response") throw new Error("fixture type");
  return item;
}

describe("startingOrder (#219)", () => {
  it("returns a permutation of the ids and leaves its inputs alone", () => {
    const input = [...ids];
    const key = ["e", "d", "c", "b", "a"];
    const order = startingOrder(input, key, "seed-1");
    expect([...order].sort()).toEqual(ids);
    expect(input).toEqual(ids);
    expect(key).toEqual(["e", "d", "c", "b", "a"]);
  });

  it("is the same every time for the same seed, and varies with the seed", () => {
    expect(startingOrder(ids, ids, "item-42")).toEqual(startingOrder(ids, ids, "item-42"));
    const seen = new Set(
      Array.from({ length: 30 }, (_, n) => startingOrder(ids, ids, `s${n}`).join(",")),
    );
    expect(seen.size).toBeGreaterThan(5);
  });

  // The property the issue asks for: for two or more steps, never the key, for any seed and any
  // relation between the authored order and the key.
  it.each([2, 3, 4, 5, 6])("is never the key for %i steps, whatever the key and the seed", (n) => {
    const steps = ids.concat(["f"]).slice(0, n);
    const keys =
      n <= 4 ? permutations(steps) : [steps, [...steps].reverse(), permutations(steps)[7]!];
    for (const key of keys) {
      for (let s = 0; s < 150; s += 1) {
        const order = startingOrder(steps, key, `seed-${s}`);
        expect(order).not.toEqual(key);
        expect([...order].sort()).toEqual([...steps].sort());
      }
    }
  });

  it("gives two steps the one other order", () => {
    for (let s = 0; s < 50; s += 1) {
      expect(startingOrder(["x", "y"], ["x", "y"], `seed-${s}`)).toEqual(["y", "x"]);
      expect(startingOrder(["x", "y"], ["y", "x"], `seed-${s}`)).toEqual(["x", "y"]);
    }
  });

  it("leaves a list too short to scramble as it is", () => {
    expect(startingOrder(["only"], ["only"], "seed")).toEqual(["only"]);
    expect(startingOrder([], [], "seed")).toEqual([]);
  });

  it("keeps the order the gallery and the play page have always shown when authored = key", () => {
    // Same generator as before #219, so no screenshot baseline moves for the fixtures.
    const item = orderedFixture();
    expect(startingOrder(item.answerKey.orderedIds, item.answerKey.orderedIds, item.id)).toEqual([
      "act_rhythm",
      "act_help",
      "act_aed",
      "act_shock",
      "act_cpr",
    ]);
  });
});

describe("startingOrderSeed", () => {
  it("scopes the seed to a session or an attempt and the item", () => {
    expect(startingOrderSeed("session-1", "item-1")).toBe("session-1:item-1");
    expect(startingOrderSeed("session-1", "item-1")).not.toBe(startingOrderSeed("s2", "item-1"));
  });
});

describe("withStartingOrder", () => {
  it("lists the steps in the starting order, never the key's, and changes nothing else", () => {
    const item = orderedFixture();
    const snapshot = structuredClone(item);
    for (let s = 0; s < 100; s += 1) {
      const started = withStartingOrder(item, `seed-${s}`);
      if (started.type !== "ordered_response") throw new Error("type");
      const shown = started.content.items.map((step) => step.id);
      expect(shown).not.toEqual(item.answerKey.orderedIds);
      expect(shown).toEqual(
        startingOrder(
          item.content.items.map((step) => step.id),
          item.answerKey.orderedIds,
          `seed-${s}`,
        ),
      );
      expect(started.answerKey).toEqual(item.answerKey);
      expect(started.stem).toBe(item.stem);
    }
    expect(item).toEqual(snapshot);
  });

  it("hands every other type back untouched", () => {
    for (const fixture of allFixtures) {
      const item = itemSchema.parse(fixture.canonical);
      if (item.type === "ordered_response") continue;
      expect(withStartingOrder(item, "seed")).toBe(item);
    }
  });

  it("changes no score: every fixture response scores the same after the steps are scrambled", () => {
    for (const variant of ["canonical", "edge"] as const) {
      const item = itemSchema.parse(FIXTURES.ordered_response[variant]);
      if (item.type !== "ordered_response") throw new Error("type");
      for (let s = 0; s < 20; s += 1) {
        const started = withStartingOrder(item, `seed-${s}`);
        for (const scored of FIXTURES.ordered_response.cases) {
          if (variant === "edge") continue;
          expect(scoreItem(started, scored.response)).toEqual(scoreItem(item, scored.response));
        }
        // The key order scores full marks on the scrambled item, whatever the student was shown.
        const full = scoreItem(started, {
          type: "ordered_response",
          orderedIds: [...item.answerKey.orderedIds],
        });
        expect(full.points).toBe(full.maxPoints);
        expect(full.maxPoints).toBeGreaterThan(0);
        // And the order they were shown, unmoved, does not.
        if (started.type !== "ordered_response") throw new Error("type");
        const unmoved = scoreItem(started, {
          type: "ordered_response",
          orderedIds: started.content.items.map((step) => step.id),
        });
        expect(unmoved.points).toBeLessThan(unmoved.maxPoints);
      }
    }
  });
});
