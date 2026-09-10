import { describe, expect, it } from "vitest";
import { scorePlusMinus, scoreRationale, scoreZeroOne, sumResults } from "./models";

describe("scoreZeroOne", () => {
  it("sums one point per correct element", () => {
    const r = scoreZeroOne([
      { id: "a", correct: true },
      { id: "b", correct: false },
      { id: "c", correct: true },
    ]);
    expect(r).toMatchObject({ model: "zero_one", points: 2, maxPoints: 3 });
    expect(r.breakdown.map((b) => b.delta)).toEqual([1, 0, 1]);
  });

  it("handles no elements", () => {
    expect(scoreZeroOne([])).toMatchObject({ points: 0, maxPoints: 0 });
  });
});

describe("scorePlusMinus", () => {
  const correct = ["a", "b", "c"];

  it("gives full credit for exactly the correct set", () => {
    expect(scorePlusMinus({ selected: ["a", "b", "c"], correct })).toMatchObject({
      points: 3,
      maxPoints: 3,
    });
  });

  it("subtracts one per incorrect selection", () => {
    expect(scorePlusMinus({ selected: ["a", "b", "x"], correct }).points).toBe(1);
  });

  it("floors at zero when over-selecting wrong options", () => {
    const r = scorePlusMinus({ selected: ["x", "y", "z", "a"], correct });
    expect(r.points).toBe(0);
    expect(r.breakdown.filter((b) => !b.correct && b.delta === -1)).toHaveLength(3);
  });

  it("scores an empty response as zero without penalty", () => {
    const r = scorePlusMinus({ selected: [], correct });
    expect(r.points).toBe(0);
    expect(r.breakdown).toHaveLength(3);
    expect(r.breakdown.every((b) => b.delta === 0 && !b.correct)).toBe(true);
  });

  it("ignores duplicate selections and attaches labels", () => {
    const r = scorePlusMinus({ selected: ["a", "a"], correct, labels: { a: "Alpha" } });
    expect(r.points).toBe(1);
    expect(r.breakdown[0]).toMatchObject({ elementId: "a", label: "Alpha", correct: true });
  });
});

describe("scoreRationale", () => {
  it("dyad: 1 point only when both blanks are correct", () => {
    const both = scoreRationale([
      { blankId: "b1", correct: true },
      { blankId: "b2", correct: true },
    ]);
    expect(both).toMatchObject({ points: 1, maxPoints: 1, model: "rationale" });
    const one = scoreRationale([
      { blankId: "b1", correct: true },
      { blankId: "b2", correct: false },
    ]);
    expect(one.points).toBe(0);
  });

  it("triad: anchor wrong scores zero even if supporters are right", () => {
    const r = scoreRationale(
      [
        { blankId: "cond", correct: false },
        { blankId: "s1", correct: true },
        { blankId: "s2", correct: true },
      ],
      "cond",
    );
    expect(r).toMatchObject({ points: 0, maxPoints: 2 });
  });

  it("triad: anchor right earns one point per correct supporter", () => {
    const r = scoreRationale(
      [
        { blankId: "cond", correct: true },
        { blankId: "s1", correct: true },
        { blankId: "s2", correct: false },
      ],
      "cond",
    );
    expect(r.points).toBe(1);
    const full = scoreRationale(
      [
        { blankId: "s1", correct: true },
        { blankId: "cond", correct: true },
        { blankId: "s2", correct: true },
      ],
      "cond",
    );
    expect(full.points).toBe(2);
  });

  it("triad: defaults the anchor to the first blank", () => {
    const r = scoreRationale([
      { blankId: "x", correct: false },
      { blankId: "y", correct: true },
      { blankId: "z", correct: true },
    ]);
    expect(r.points).toBe(0);
  });

  it("rejects wrong blank counts and unknown anchors", () => {
    expect(() => scoreRationale([{ blankId: "only", correct: true }])).toThrow(RangeError);
    expect(() =>
      scoreRationale(
        [
          { blankId: "a", correct: true },
          { blankId: "b", correct: true },
          { blankId: "c", correct: true },
        ],
        "nope",
      ),
    ).toThrow(RangeError);
  });
});

describe("sumResults", () => {
  it("adds points, max and concatenates breakdowns", () => {
    const a = scoreZeroOne([{ id: "r1", correct: true }]);
    const b = scoreZeroOne([{ id: "r2", correct: false }]);
    const sum = sumResults("zero_one", [a, b]);
    expect(sum).toMatchObject({ points: 1, maxPoints: 2 });
    expect(sum.breakdown.map((x) => x.elementId)).toEqual(["r1", "r2"]);
  });
});
