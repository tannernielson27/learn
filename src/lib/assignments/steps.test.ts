import { describe, expect, it } from "vitest";
import type { StepAttempt } from "@/lib/supabase/steps";
import { assignmentStepMarks, buildMyStepStandings } from "./steps";

const attempt = (
  assignmentId: string,
  number: number,
  score: number | null,
  marks: StepAttempt["marks"],
  submittedAt: string | null = "2026-09-22T11:00:00Z",
): StepAttempt => ({ assignmentId, number, submittedAt, score, maxScore: 4, marks });

const m = (cjmmStep: number | null, points: number, maxPoints = 1) => ({
  cjmmStep,
  points,
  maxPoints,
});

describe("assignmentStepMarks (#239)", () => {
  it("takes each assignment's best attempt only, as the assignment source", () => {
    const marks = assignmentStepMarks([
      attempt("w1", 1, 1, [m(1, 0), m(2, 1)]),
      attempt("w1", 2, 3, [m(1, 1), m(2, 1)]),
      attempt("w2", 1, 2, [m(6, 1, 2)]),
    ]);
    expect(marks).toEqual([
      { source: "assignments", cjmmStep: 1, points: 1, maxPoints: 1 },
      { source: "assignments", cjmmStep: 2, points: 1, maxPoints: 1 },
      { source: "assignments", cjmmStep: 6, points: 1, maxPoints: 2 },
    ]);
  });

  it("gives a tie to the earlier attempt, and never counts one without a score", () => {
    const marks = assignmentStepMarks([
      attempt("w1", 1, 2, [m(3, 0)]),
      attempt("w1", 2, 2, [m(3, 1)]),
      attempt("w1", 3, null, [m(3, 1)]),
      attempt("w2", 1, 4, [m(4, 1)], null),
    ]);
    expect(marks).toEqual([{ source: "assignments", cjmmStep: 3, points: 0, maxPoints: 1 }]);
  });

  it("does not change its input", () => {
    const input = [attempt("w1", 1, 1, [m(1, 1)])];
    const before = JSON.stringify(input);
    assignmentStepMarks(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe("buildMyStepStandings (#239)", () => {
  it("ranks the steps from the best attempts", () => {
    const five = (step: number, right: number) =>
      Array.from({ length: 5 }, (_, i) => m(step, i < right ? 1 : 0));
    const { steps } = buildMyStepStandings([
      attempt("w1", 1, 0, [...five(1, 4), ...five(2, 1)]),
      attempt("w1", 2, 4, [...five(1, 5), ...five(2, 5)]),
      attempt("w2", 1, 1, [...five(3, 2)]),
    ]);
    expect(steps.slice(0, 3).map((s) => [s.step, s.percent])).toEqual([
      [3, 40],
      [1, 100],
      [2, 100],
    ]);
  });
});
