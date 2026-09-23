import { describe, expect, it } from "vitest";
import { allFixtures } from "@/lib/ngn/fixtures";
import { ITEM_TYPES, itemSchema, type Item, type ItemType } from "@/lib/ngn/schemas";
import { distributionFor, type DistributionKind } from "./index";

const KIND: Record<ItemType, DistributionKind> = {
  multiple_choice: "options",
  multiple_response: "options",
  multiple_response_grouping: "grid",
  matrix_multiple_choice: "grid",
  matrix_multiple_response: "grid",
  highlight_text: "grid",
  highlight_table: "grid",
  dropdown_cloze: "blanks",
  dropdown_table: "blanks",
  dragdrop_cloze: "blanks",
  bowtie: "slots",
  ordered_response: "order",
  dropdown_rationale: "pairs",
  dragdrop_rationale: "pairs",
};

/** Every tally in a distribution, found by name wherever it sits. */
function tallies(value: unknown): number[] {
  const found: number[] = [];
  JSON.stringify(value, (key, inner: unknown) => {
    if (["count", "unanswered", "exact", "allCorrect"].includes(key) && typeof inner === "number") {
      found.push(inner);
    }
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

const MALFORMED: unknown[] = [null, undefined, 42, "text", [], {}, { type: "no_such_type" }];

const items = allFixtures.flatMap((fixture) => [
  { name: `${fixture.type} canonical`, fixture, item: itemSchema.parse(fixture.canonical) as Item },
  { name: `${fixture.type} edge`, fixture, item: itemSchema.parse(fixture.edge) as Item },
]);

describe("distributionFor", () => {
  it("has a kind for every item type", () => {
    expect(Object.keys(KIND).sort()).toEqual([...ITEM_TYPES].sort());
    expect(allFixtures.map((fixture) => fixture.type).sort()).toEqual([...ITEM_TYPES].sort());
  });

  it.each(items)("$name: an empty room counts nothing", ({ item }) => {
    const result = distributionFor(item, []);
    expect(result).toMatchObject({
      kind: KIND[item.type],
      itemId: item.id,
      itemType: item.type,
      responded: 0,
      unreadable: 0,
    });
    expect(tallies(result).length).toBeGreaterThan(0);
    expect(tallies(result).every((n) => n === 0)).toBe(true);
    if (result.kind === "pairs") expect(result.commonWrong).toEqual([]);
  });

  it.each(items)("$name: malformed responses are unreadable, never thrown", ({ item }) => {
    const result = distributionFor(item, MALFORMED);
    expect(result).toMatchObject({ responded: 0, unreadable: MALFORMED.length });
    expect(tallies(result).every((n) => n === 0)).toBe(true);
  });

  it.each(allFixtures)("$type: every scoring case reads, and the case count adds up", (fixture) => {
    const item = itemSchema.parse(fixture.canonical) as Item;
    const responses = fixture.cases.map((c) => c.response);
    const result = distributionFor(item, responses);
    expect(result).toMatchObject({ responded: responses.length, unreadable: 0 });
    expect(tallies(result).some((n) => n > 0)).toBe(true);
  });

  it.each(allFixtures)("$type: never mutates the item or the responses", (fixture) => {
    const item = itemSchema.parse(fixture.canonical) as Item;
    const responses = [...fixture.cases.map((c) => c.response), ...MALFORMED];
    const before = JSON.stringify({ item, responses });
    const frozen = deepFreeze(structuredClone({ item, responses }));
    expect(() => distributionFor(frozen.item, frozen.responses)).not.toThrow();
    expect(JSON.stringify(frozen)).toBe(before);
  });

  it("reads a response to another item type as unreadable", () => {
    const [first, second] = allFixtures;
    if (!first || !second) throw new Error("fixtures missing");
    const item = itemSchema.parse(first.canonical) as Item;
    const foreign = second.cases.map((c) => c.response);
    expect(distributionFor(item, foreign)).toMatchObject({
      responded: 0,
      unreadable: foreign.length,
    });
  });
});
