import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { scoreAttempt, type SetItem } from "./attemptScoring";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;
const ORDERED = itemSchema.parse(FIXTURES.ordered_response.canonical) as Item;

const SET: SetItem[] = [
  { rowId: "00000000-0000-0000-0000-000000000001", item: MC },
  { rowId: "00000000-0000-0000-0000-000000000002", item: MR },
  { rowId: "00000000-0000-0000-0000-000000000003", item: ORDERED },
];

describe("scoreAttempt", () => {
  it("scores every saved answer through the one scoring entry point and totals the set", () => {
    const answers = {
      "00000000-0000-0000-0000-000000000001": { type: "multiple_choice", optionId: "opt_a" },
      "00000000-0000-0000-0000-000000000002": {
        type: "multiple_response",
        optionIds: ["opt_a", "opt_b", "opt_c"],
      },
    };
    const scored = scoreAttempt(SET, answers);
    // MC right (1 of 1), MR two right one wrong under +/- (1 of 3), ordered unanswered (0 of max).
    expect(scored.total).toBe(2);
    expect(scored.possible).toBe(1 + 3 + ORDERED.scoring.maxPoints);
    expect(scored.marks).toHaveLength(2);
    expect(scored.marks[0]).toMatchObject({
      item_id: "00000000-0000-0000-0000-000000000001",
      points: 1,
      max_points: 1,
      model: "zero_one",
    });
    expect(scored.marks[1]).toMatchObject({ points: 1, max_points: 3, model: "plus_minus" });
  });

  it("never gives an unanswered ordered response the key's own order as an answer", () => {
    const scored = scoreAttempt(SET, {});
    expect(scored.total).toBe(0);
    expect(scored.marks).toEqual([]);
  });

  it("scores an answer that does not parse, or is for another type, as nothing", () => {
    const scored = scoreAttempt(SET, {
      "00000000-0000-0000-0000-000000000001": { type: "multiple_response", optionIds: ["opt_a"] },
      "00000000-0000-0000-0000-000000000002": { nonsense: true },
    });
    expect(scored.total).toBe(0);
    expect(scored.marks.map((mark) => mark.points)).toEqual([0, 0]);
    expect(scored.marks.map((mark) => mark.max_points)).toEqual([1, 3]);
  });

  it("scores an answer naming options the item does not have as nothing, not as an error", () => {
    const scored = scoreAttempt(SET, {
      "00000000-0000-0000-0000-000000000001": { type: "multiple_choice", optionId: "opt_zz" },
    });
    expect(scored.total).toBe(0);
    expect(scored.possible).toBe(1 + 3 + ORDERED.scoring.maxPoints);
  });

  it("ignores answers for items that are not in the set", () => {
    const scored = scoreAttempt(SET, {
      "00000000-0000-0000-0000-00000000ffff": { type: "multiple_choice", optionId: "opt_a" },
    });
    expect(scored.total).toBe(0);
    expect(scored.marks).toEqual([]);
  });

  it("does not change what it is given", () => {
    const answers = Object.freeze({
      "00000000-0000-0000-0000-000000000001": Object.freeze({
        type: "multiple_choice",
        optionId: "opt_a",
      }),
    });
    const before = JSON.stringify(SET);
    scoreAttempt(SET, answers);
    expect(JSON.stringify(SET)).toBe(before);
  });
});
