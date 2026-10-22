import { describe, expect, it } from "vitest";
import {
  formatPoints,
  isFullMarks,
  isMissedRow,
  stepShares,
  totalsOf,
  verdictLine,
  verdictOf,
  type ResultRow,
} from "./resultsSummary";

const row = (over: Partial<ResultRow>): ResultRow => ({
  id: "r",
  number: 1,
  stem: "Which finding?",
  step: 1,
  points: 1,
  maxPoints: 1,
  verdict: "full",
  ...over,
});

describe("verdicts", () => {
  it("are the score panel's: full, partial and none, and an item worth nothing is never full", () => {
    expect(verdictOf(2, 2)).toBe("full");
    expect(verdictOf(1, 2)).toBe("partial");
    expect(verdictOf(0, 2)).toBe("none");
    expect(verdictOf(0, 0)).toBe("none");
    expect(isFullMarks({ points: 0, maxPoints: 0 })).toBe(false);
  });

  it("say the verdict and the points in one line", () => {
    expect(verdictLine(row({ verdict: "partial", points: 2, maxPoints: 3 }))).toBe(
      "Partially correct · 2/3",
    );
    expect(verdictLine(row({ verdict: "unanswered", points: null, maxPoints: 2 }))).toBe(
      "Not answered · 0/2",
    );
    expect(verdictLine(row({ verdict: "unreadable", points: null }))).toBe("Could not be shown");
    expect(formatPoints(1.005)).toBe("1");
  });

  it("count everything short of full marks as missed, except what cannot be read", () => {
    expect(isMissedRow(row({ verdict: "full" }))).toBe(false);
    expect(isMissedRow(row({ verdict: "partial" }))).toBe(true);
    expect(isMissedRow(row({ verdict: "unanswered" }))).toBe(true);
    expect(isMissedRow(row({ verdict: "unreadable" }))).toBe(false);
  });
});

describe("totalsOf", () => {
  it("adds the marks, the maximum, the percent and the missed count", () => {
    expect(
      totalsOf([
        row({ points: 1, maxPoints: 1 }),
        row({ points: 1, maxPoints: 3, verdict: "partial" }),
        row({ points: null, maxPoints: 1, verdict: "unanswered" }),
      ]),
    ).toEqual({ points: 2, maxPoints: 5, percent: 40, missed: 2 });
    expect(totalsOf([])).toEqual({ points: 0, maxPoints: 0, percent: 0, missed: 0 });
  });
});

describe("stepShares", () => {
  it("shares points by step, step 1 first, leaving out unstepped and unreadable rows", () => {
    expect(
      stepShares([
        row({ step: 3, points: 1, maxPoints: 2, verdict: "partial" }),
        row({ step: 1, points: 1, maxPoints: 1 }),
        row({ step: 3, points: 0, maxPoints: 2, verdict: "none" }),
        row({ step: null }),
        row({ step: 2, verdict: "unreadable", points: null }),
      ]),
    ).toEqual([
      { step: 1, label: "Recognize Cues", percent: 100, questions: 1 },
      { step: 3, label: "Prioritize Hypotheses", percent: 25, questions: 2 },
    ]);
  });
});
