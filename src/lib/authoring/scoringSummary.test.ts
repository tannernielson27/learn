import { describe, expect, it } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { ITEM_TYPES, SCORING_MODEL_LABELS } from "@/lib/ngn/labels";
import { ITEM_SCHEMAS, type Item } from "@/lib/ngn/schemas";
import { SCORING_NOT_READY, scoringSummary } from "./scoringSummary";

const samples = ITEM_TYPES.flatMap((type) => [
  [`${type} canonical`, ITEM_SCHEMAS[type].parse(FIXTURES[type].canonical) as Item] as const,
  [`${type} edge`, ITEM_SCHEMAS[type].parse(FIXTURES[type].edge) as Item] as const,
]);

describe("scoringSummary", () => {
  it.each(samples)("states the fixture's points and its rule: %s", (_name, item) => {
    const summary = scoringSummary(item.scoring, true);
    expect(summary.headline).toContain(`Worth ${item.scoring.maxPoints} point`);
    expect(summary.headline).toContain(SCORING_MODEL_LABELS[item.scoring.model].name);
    // The same sentence the student's score panel uses to explain the rule.
    expect(summary.rule).toBe(SCORING_MODEL_LABELS[item.scoring.model].explanation);
  });

  it("says one point, not one points", () => {
    expect(scoringSummary({ model: "zero_one", maxPoints: 1 }, true).headline).toBe(
      "Worth 1 point. 0/1 scoring.",
    );
    expect(scoringSummary({ model: "plus_minus", maxPoints: 3 }, true).headline).toBe(
      "Worth 3 points. +/- scoring.",
    );
  });

  it("reads naturally for every model, including rationale scoring", () => {
    expect(scoringSummary({ model: "rationale", maxPoints: 2 }, true).headline).toBe(
      "Worth 2 points. Rationale scoring.",
    );
  });

  it("asks the author to finish the item instead of guessing a number while it is invalid", () => {
    expect(SCORING_NOT_READY).toBe("Finish the item to see its score.");
    expect(scoringSummary({ model: "plus_minus", maxPoints: 1 }, false)).toEqual({
      headline: SCORING_NOT_READY,
    });
    expect(scoringSummary(undefined, true)).toEqual({ headline: SCORING_NOT_READY });
  });
});
