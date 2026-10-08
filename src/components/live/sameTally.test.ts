import { describe, expect, it } from "vitest";
import type { ItemAggregate } from "@/lib/live";
import { keepTally, sameTally } from "./sameTally";

const TALLY: ItemAggregate = {
  itemId: "item-1",
  position: 1,
  present: 5,
  responded: 3,
  fullMarks: 2,
  partialMarks: 1,
  noMarks: 0,
  meanPoints: 1.5,
  maxPoints: 2,
};

describe("sameTally", () => {
  it("is true for a fresh object with every field equal", () => {
    expect(sameTally(TALLY, { ...TALLY })).toBe(true);
  });

  // Driven by the fixture's own keys, so a field added to ItemAggregate is checked here too.
  it.each(Object.keys(TALLY) as (keyof ItemAggregate)[])("is false when %s differs", (field) => {
    const changed = { ...TALLY, [field]: typeof TALLY[field] === "string" ? "other" : -1 };
    expect(sameTally(TALLY, changed)).toBe(false);
  });

  it("treats null as equal only to null", () => {
    expect(sameTally(null, null)).toBe(true);
    expect(sameTally(null, TALLY)).toBe(false);
    expect(sameTally(TALLY, null)).toBe(false);
  });
});

describe("keepTally", () => {
  it("keeps the held object when nothing changed", () => {
    expect(keepTally({ ...TALLY })(TALLY)).toBe(TALLY);
  });

  it("takes the new object when anything changed", () => {
    const next = { ...TALLY, responded: 4 };
    expect(keepTally(next)(TALLY)).toBe(next);
    expect(keepTally(next)(null)).toBe(next);
  });
});
