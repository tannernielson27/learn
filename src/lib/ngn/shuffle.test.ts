// #209: take-home options are shuffled per attempt where the order carries no meaning. The key is
// never read by position, so a shuffled item must score every response exactly as the original.
import { describe, expect, it } from "vitest";
import { FIXTURES } from "./fixtures";
import { ITEM_TYPES, type ItemType } from "./labels";
import { ITEM_SCHEMAS, itemSchema, responseSchema, type Item, type ItemOf } from "./schemas";
import { scoreItem } from "./scoring";
import { isFixedLabel, SHUFFLE_RULES, shuffleItem, shuffleSeed } from "./shuffle";
import { toKeylessItem } from "./submit";

const parse = <T extends ItemType>(type: T, which: "canonical" | "edge" = "canonical") =>
  ITEM_SCHEMAS[type].parse(FIXTURES[type][which]) as ItemOf<T>;

const SEEDS = Array.from({ length: 40 }, (_, i) => shuffleSeed(`attempt-${i}`, "item"));

type Walk = { restored: unknown; reordered: Set<string> };

const hasId = (value: unknown): value is { id: string } =>
  typeof value === "object" && value !== null && typeof (value as { id?: unknown }).id === "string";

/**
 * Puts every reordered list of `{ id }` objects in `shuffled` back into `original`'s order and
 * records where it had to, as a path with indices dropped ("content.rows[].options"). If the
 * restored value equals the original, the shuffle changed nothing but the order of those lists.
 */
function restore(original: unknown, shuffled: unknown, path = ""): Walk {
  const reordered = new Set<string>();
  const merge = (walk: Walk) => walk.reordered.forEach((p) => reordered.add(p));
  if (Array.isArray(original) && Array.isArray(shuffled)) {
    let aligned: unknown[] = shuffled;
    if (original.length === shuffled.length && original.every(hasId) && shuffled.every(hasId)) {
      const byId = new Map(shuffled.map((entry) => [entry.id, entry]));
      if (original.some((entry, i) => entry.id !== shuffled[i].id)) reordered.add(path);
      aligned = original.map((entry) => byId.get(entry.id));
    }
    const restored = original.map((entry, i) => {
      const walk = restore(entry, aligned[i], `${path}[]`);
      merge(walk);
      return walk.restored;
    });
    return { restored, reordered };
  }
  if (typeof original === "object" && original !== null && typeof shuffled === "object") {
    const shuffledRecord = (shuffled ?? {}) as Record<string, unknown>;
    const restored = Object.fromEntries(
      Object.keys({ ...original, ...shuffledRecord }).map((key) => {
        const walk = restore(
          (original as Record<string, unknown>)[key],
          shuffledRecord[key],
          path ? `${path}.${key}` : key,
        );
        merge(walk);
        return [key, walk.restored];
      }),
    );
    return { restored, reordered };
  }
  return { restored: shuffled, reordered };
}

const fixtureItems = ITEM_TYPES.flatMap((type) => [
  { type, name: `${type} canonical`, item: parse(type, "canonical") as Item },
  { type, name: `${type} edge`, item: parse(type, "edge") as Item },
]);

describe("SHUFFLE_RULES", () => {
  it("has a rule for every item type and no other", () => {
    expect(Object.keys(SHUFFLE_RULES).sort()).toEqual([...ITEM_TYPES].sort());
  });

  it("never permutes the lists whose position is the answer", () => {
    expect(SHUFFLE_RULES.ordered_response.permuted).toEqual([]);
    expect(SHUFFLE_RULES.highlight_text.permuted).toEqual([]);
    expect(SHUFFLE_RULES.highlight_table.permuted).toEqual([]);
  });
});

describe("shuffleItem", () => {
  for (const { type, name, item } of fixtureItems) {
    describe(name, () => {
      it("changes nothing but the order of the lists its rule names", () => {
        const seen = new Set<string>();
        for (const seed of SEEDS) {
          const walk = restore(item, shuffleItem(item, seed));
          expect(walk.restored).toEqual(item);
          walk.reordered.forEach((p) => seen.add(p));
        }
        for (const path of seen) expect(SHUFFLE_RULES[type].permuted).toContain(path);
      });

      it("reorders every list its rule names, across enough seeds", () => {
        if (name.endsWith("edge")) return; // edge items may hold one-element lists
        const seen = new Set<string>();
        for (const seed of SEEDS)
          restore(item, shuffleItem(item, seed)).reordered.forEach((p) => seen.add(p));
        expect([...seen].sort()).toEqual([...SHUFFLE_RULES[type].permuted].sort());
      });

      it("still validates as an item of its type", () => {
        for (const seed of SEEDS.slice(0, 5)) {
          expect(() => itemSchema.parse(shuffleItem(item, seed))).not.toThrow();
        }
      });

      it("scores every fixture response exactly as the original does", () => {
        for (const c of FIXTURES[type].cases) {
          const response = responseSchema.parse(c.response);
          const expected = scoreItem(item, response);
          for (const seed of SEEDS)
            expect(scoreItem(shuffleItem(item, seed), response)).toEqual(expected);
        }
      });

      it("gives the same order for the same seed, as after a reload", () => {
        expect(shuffleItem(item, SEEDS[3])).toEqual(shuffleItem(item, SEEDS[3]));
      });

      it("never changes the item it is given", () => {
        const before = structuredClone(item);
        const frozen = deepFreeze(structuredClone(item));
        for (const seed of SEEDS.slice(0, 5)) {
          expect(() => shuffleItem(frozen, seed)).not.toThrow();
          const out = shuffleItem(item, seed);
          expect(out).not.toBe(item);
        }
        expect(item).toEqual(before);
      });

      it("shuffles a keyless item exactly as it shuffles the whole one", () => {
        const keyless = toKeylessItem(item);
        const shuffled = shuffleItem(keyless, SEEDS[7]);
        expect(shuffled).toEqual(toKeylessItem(shuffleItem(item, SEEDS[7])));
        expect("answerKey" in shuffled).toBe(false);
      });
    });
  }

  it("refuses a type it has no rule for, such as a row an older deploy wrote", () => {
    const unknown = { type: "hot_spot_image", content: {} } as unknown as Item;
    expect(() => shuffleItem(unknown, SEEDS[0])).toThrow(/no shuffle rule/);
  });

  it("gives different students different orders", () => {
    const item = parse("multiple_response");
    const orders = new Set(
      Array.from({ length: 200 }, (_, i) =>
        shuffleItem(item, shuffleSeed(`student-${i}`, item.id))
          .content.options.map((o) => o.id)
          .join(","),
      ),
    );
    expect(orders.size).toBeGreaterThan(150);
  });
});

/** Chi-square of observed counts against a uniform spread. */
const chiSquare = (counts: readonly number[]) => {
  const total = counts.reduce((a, b) => a + b, 0);
  const expected = total / counts.length;
  return counts.reduce((sum, n) => sum + (n - expected) ** 2 / expected, 0);
};
// p = 0.001 critical values by degrees of freedom. The seeds are fixed, so the test cannot flake.
const CRITICAL: Record<number, number> = {
  1: 10.83,
  2: 13.82,
  3: 16.27,
  4: 18.47,
  5: 20.52,
  6: 22.46,
  7: 24.32,
  8: 26.12,
  9: 27.88,
};

const positionCounts = (length: number, positions: Iterable<number>) => {
  const counts = new Array<number>(length).fill(0);
  for (const p of positions) counts[p] += 1;
  return counts;
};

describe("the key does not leak through position", () => {
  const TRIALS = 3_000;
  const seeds = Array.from({ length: TRIALS }, (_, i) => shuffleSeed(`leak-${i}`, "item"));

  it("multiple choice: the correct option sits at every position about equally often", () => {
    const item = parse("multiple_choice");
    const n = item.content.options.length;
    const counts = positionCounts(
      n,
      seeds.map((seed) =>
        shuffleItem(item, seed).content.options.findIndex(
          (o) => o.id === item.answerKey.correctOptionId,
        ),
      ),
    );
    expect(chiSquare(counts)).toBeLessThan(CRITICAL[n - 1]);
  });

  it("SATA: each correct option sits at every position about equally often", () => {
    const item = parse("multiple_response");
    const n = item.content.options.length;
    for (const correct of item.answerKey.correctOptionIds) {
      const counts = positionCounts(
        n,
        seeds.map((seed) =>
          shuffleItem(item, seed).content.options.findIndex((o) => o.id === correct),
        ),
      );
      expect(chiSquare(counts)).toBeLessThan(CRITICAL[n - 1]);
    }
  });

  it("drop-down cloze: each blank's correct choice sits at every position about equally often", () => {
    const item = parse("dropdown_cloze");
    for (const key of item.answerKey.blanks) {
      const blank = item.content.blanks.find((b) => b.id === key.blankId)!;
      const counts = positionCounts(
        blank.choices.length,
        seeds.map((seed) =>
          shuffleItem(item, seed)
            .content.blanks.find((b) => b.id === key.blankId)!
            .choices.findIndex((c) => c.id === key.correctChoiceId),
        ),
      );
      expect(chiSquare(counts)).toBeLessThan(CRITICAL[blank.choices.length - 1]);
    }
  });

  it("bowtie: the correct condition sits at every position about equally often", () => {
    const item = parse("bowtie");
    const counts = positionCounts(
      4,
      seeds.map((seed) =>
        shuffleItem(item, seed).content.conditions.findIndex(
          (c) => c.id === item.answerKey.conditionId,
        ),
      ),
    );
    expect(chiSquare(counts)).toBeLessThan(CRITICAL[3]);
  });
});

describe("fixed options", () => {
  it.each([
    "All of the above",
    "None of the above",
    "all of these",
    "Both of the above",
    "Neither of the options",
    "Options A and C",
    "Choice 2",
  ])("treats %j as fixed", (label) => {
    expect(isFixedLabel(label)).toBe(true);
  });

  it.each([
    "Check the apical pulse",
    "Pain above the incision",
    "Elevate the leg above the heart",
    "None",
    "Administer all prescribed doses",
  ])("treats %j as free to move", (label) => {
    expect(isFixedLabel(label)).toBe(false);
  });

  it("keeps an 'All of the above' option at the index the author gave it", () => {
    const base = parse("multiple_choice");
    const options = [
      ...base.content.options.slice(0, 3),
      { id: "opt_all", label: "All of the above" },
    ];
    const item = { ...base, content: { options } };
    const others = new Set<string>();
    for (const seed of SEEDS) {
      const out = shuffleItem(item, seed).content.options;
      expect(out[3].id).toBe("opt_all");
      others.add(out.map((o) => o.id).join(","));
    }
    expect(others.size).toBeGreaterThan(1);
  });
});

describe("shuffleSeed", () => {
  it("joins the attempt and the item", () => {
    expect(shuffleSeed("a1", "i1")).toBe("a1:i1");
    expect(shuffleSeed("a1", "i1")).not.toBe(shuffleSeed("a1", "i2"));
  });

  it("refuses an empty attempt or item id", () => {
    expect(() => shuffleSeed("", "i1")).toThrow();
    expect(() => shuffleSeed("a1", "")).toThrow();
  });

  it("refuses ids outside the id alphabet, so no two seeds can collide on a separator", () => {
    expect(() => shuffleSeed("a:1", "i1")).toThrow();
    expect(() => shuffleSeed("a1", "i|1")).toThrow();
    expect(() => shuffleSeed("a1", "x".repeat(65))).toThrow();
  });

  it("accepts a uuid attempt id", () => {
    expect(shuffleSeed("0b6f3c8e-4c1a-4f7e-9d2b-7a5e1c3d9f01", "i1")).toContain(":i1");
  });
});

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
