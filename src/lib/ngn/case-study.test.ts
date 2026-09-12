import { describe, expect, it } from "vitest";
import { sampleCaseStudy } from "./fixtures";
import { caseStudySchema } from "./schemas";
import { caseStudyMaxPoints, maxPoints, totalScore } from "./scoring";
import type { ScoreResult } from "./types";

const result = (points: number, max: number): ScoreResult => ({
  points,
  maxPoints: max,
  model: "zero_one",
  breakdown: [],
});

const sample = caseStudySchema.parse(sampleCaseStudy);

describe("totalScore", () => {
  it("adds up the points and the maxima of every step", () => {
    expect(totalScore([result(2, 4), result(1, 1), result(0, 3)])).toEqual({
      points: 3,
      maxPoints: 8,
    });
  });

  it("is empty rather than undefined before any step is scored", () => {
    expect(totalScore([])).toEqual({ points: 0, maxPoints: 0 });
  });
});

describe("caseStudyMaxPoints", () => {
  it("is what the six items can award between them", () => {
    // 4 highlight + 4 matrix rows + 2 triad + 4 SATA + 1 whole-order + 4 matrix rows.
    expect(caseStudyMaxPoints(sample)).toBe(19);
  });

  it("comes from the scoring rules, not from the authored metadata", () => {
    expect(caseStudyMaxPoints(sample)).toBe(
      sample.items.reduce((sum, item) => sum + maxPoints(item), 0),
    );
  });
});
