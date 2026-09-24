import { describe, expect, it } from "vitest";
import { sampleCaseStudy } from "./fixtures/case-study";
import {
  MIN_ITEMS_TO_RANK,
  buildStepStandings,
  type StepMark,
  type StepSource,
} from "./stepStandings";

const mark = (
  cjmmStep: number | null,
  points: number,
  maxPoints = 1,
  source: StepSource = "assignments",
): StepMark => ({ source, cjmmStep, points, maxPoints });

/** `count` marks on one step, `right` of them earning everything. */
const marks = (cjmmStep: number, count: number, right: number, source?: StepSource) =>
  Array.from({ length: count }, (_, index) => mark(cjmmStep, index < right ? 1 : 0, 1, source));

describe("buildStepStandings (#239)", () => {
  it("always lists the six steps, with their labels, even with no answers", () => {
    const { steps, untagged } = buildStepStandings([]);
    expect(steps.map((s) => s.step)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(steps.map((s) => s.label)).toEqual([
      "Recognize Cues",
      "Analyze Cues",
      "Prioritize Hypotheses",
      "Generate Solutions",
      "Take Action",
      "Evaluate Outcomes",
    ]);
    expect(steps.every((s) => !s.ranked && s.items === 0 && s.percent === null)).toBe(true);
    expect(untagged).toMatchObject({ items: 0, points: 0, maxPoints: 0 });
  });

  it("adds up points earned and possible per step, with the percent and item count", () => {
    const { steps } = buildStepStandings([mark(2, 1, 2), mark(2, 2, 2), mark(2, 0, 4)]);
    const analyze = steps.find((s) => s.step === 2);
    expect(analyze).toMatchObject({ items: 3, points: 3, maxPoints: 8, percent: 37.5 });
  });

  it("ranks the steps with enough answers weakest first", () => {
    const { steps } = buildStepStandings([
      ...marks(1, 12, 3),
      ...marks(2, 5, 4),
      ...marks(3, 6, 3),
      ...marks(4, 5, 5),
      ...marks(5, 8, 2),
      ...marks(6, 10, 6),
    ]);
    expect(steps.map((s) => s.step)).toEqual([1, 5, 3, 6, 2, 4]);
    expect(steps.every((s) => s.ranked)).toBe(true);
    expect(steps[0]).toMatchObject({ step: 1, items: 12, percent: 25 });
  });

  it("breaks a tie by the spec's step order", () => {
    const { steps } = buildStepStandings([
      ...marks(6, 5, 2),
      ...marks(4, 10, 4),
      ...marks(2, 5, 2),
    ]);
    expect(steps.slice(0, 3).map((s) => [s.step, s.percent])).toEqual([
      [2, 40],
      [4, 40],
      [6, 40],
    ]);
  });

  it(`does not rank a step with fewer than ${MIN_ITEMS_TO_RANK} items, and lists it after, in step order`, () => {
    expect(MIN_ITEMS_TO_RANK).toBe(5);
    const { steps } = buildStepStandings([...marks(5, 4, 0), ...marks(3, 5, 5), ...marks(1, 1, 0)]);
    expect(steps.map((s) => [s.step, s.ranked])).toEqual([
      [3, true],
      [1, false],
      [2, false],
      [4, false],
      [5, false],
      [6, false],
    ]);
    // Its numbers are still there; it is only not ranked.
    expect(steps.find((s) => s.step === 5)).toMatchObject({ items: 4, points: 0, percent: 0 });
  });

  it("does not rank a step whose items were worth nothing", () => {
    const { steps } = buildStepStandings(Array.from({ length: 6 }, () => mark(4, 0, 0)));
    expect(steps.find((s) => s.step === 4)).toMatchObject({
      items: 6,
      percent: null,
      ranked: false,
    });
  });

  it("puts items with no step under Untagged, and never ranks them", () => {
    const { steps, untagged } = buildStepStandings([
      mark(null, 1, 2),
      mark(null, 0, 1),
      mark(7, 1, 1),
      mark(2.5, 1, 1),
      mark(0, 1, 1),
      mark(3, 1, 1),
    ]);
    expect(untagged).toMatchObject({ items: 5, points: 4, maxPoints: 6 });
    expect(steps.reduce((sum, s) => sum + s.items, 0)).toBe(1);
  });

  it("counts each of a case study's six items under its own step", () => {
    const fromCaseStudy = sampleCaseStudy.items.map((item, index) =>
      mark(item.cjmmStep ?? null, index % 2, 1),
    );
    const { steps, untagged } = buildStepStandings(fromCaseStudy);
    expect(untagged.items).toBe(0);
    expect(
      [...steps].sort((a, b) => a.step - b.step).map((s) => [s.step, s.items, s.points]),
    ).toEqual([
      [1, 1, 0],
      [2, 1, 1],
      [3, 1, 0],
      [4, 1, 1],
      [5, 1, 0],
      [6, 1, 1],
    ]);
  });

  it("keeps the counts from each source apart, and ranks on both together", () => {
    const { steps } = buildStepStandings([
      ...marks(1, 3, 0, "assignments"),
      ...marks(1, 2, 2, "practice"),
      mark(null, 1, 1, "practice"),
    ]);
    const recognize = steps.find((s) => s.step === 1);
    expect(recognize).toMatchObject({
      items: 5,
      points: 2,
      maxPoints: 5,
      percent: 40,
      ranked: true,
    });
    expect(recognize?.bySource).toEqual({
      assignments: { items: 3, points: 0, maxPoints: 3 },
      practice: { items: 2, points: 2, maxPoints: 2 },
    });
    const { untagged } = buildStepStandings([mark(null, 1, 1, "practice")]);
    expect(untagged.bySource).toEqual({
      assignments: { items: 0, points: 0, maxPoints: 0 },
      practice: { items: 1, points: 1, maxPoints: 1 },
    });
  });

  it("leaves out a mark that is not a real score", () => {
    const { steps, untagged } = buildStepStandings([
      mark(1, Number.NaN, 1),
      mark(1, 1, Number.POSITIVE_INFINITY),
      mark(1, -1, 1),
      mark(1, 2, 1),
      mark(1, 1, -1),
      mark(null, 1, Number.NaN),
      mark(1, 1, 1),
    ]);
    expect(steps.find((s) => s.step === 1)).toMatchObject({ items: 1, points: 1, maxPoints: 1 });
    expect(untagged.items).toBe(0);
  });

  it("does not change its input", () => {
    const input = Object.freeze([...marks(1, 5, 1)].map((m) => Object.freeze(m)));
    const before = JSON.stringify(input);
    buildStepStandings(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
