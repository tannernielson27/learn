import { describe, expect, it } from "vitest";
import { homeSections, stepsHaveAnswers, type HomeSectionsInput } from "./homeSections";

const EMPTY: HomeSectionsInput = {
  classes: [{ id: "c1" }],
  assignments: [],
  history: [],
  live: [],
  practice: [],
  stepsAnswered: false,
};

describe("homeSections", () => {
  it("collapses every empty part into one first-use state for a student in a class", () => {
    expect(homeSections(EMPTY)).toEqual({
      assignments: false,
      history: false,
      live: false,
      practice: false,
      steps: false,
      firstUse: true,
    });
  });

  it("keeps the parts with rows and drops the empty ones, with no first-use state", () => {
    const sections = homeSections({ ...EMPTY, assignments: [{}], stepsAnswered: true });
    expect(sections).toEqual({
      assignments: true,
      history: false,
      live: false,
      practice: false,
      steps: true,
      firstUse: false,
    });
  });

  it("keeps a part that did not load, so its message is seen, and draws no first-use state", () => {
    const sections = homeSections({ ...EMPTY, practice: null, stepsAnswered: null });
    expect(sections.practice).toBe(true);
    expect(sections.steps).toBe(true);
    expect(sections.firstUse).toBe(false);
  });

  it("draws no first-use state for a student with no class, who is shown the class code instead", () => {
    expect(homeSections({ ...EMPTY, classes: [] }).firstUse).toBe(false);
    expect(homeSections({ ...EMPTY, classes: null }).firstUse).toBe(false);
  });

  it("counts each list on its own", () => {
    expect(homeSections({ ...EMPTY, history: [{}] }).history).toBe(true);
    expect(homeSections({ ...EMPTY, live: [{}] }).live).toBe(true);
    expect(homeSections({ ...EMPTY, practice: [{}] }).practice).toBe(true);
  });
});

describe("stepsHaveAnswers", () => {
  const counts = (items: number[], untagged = 0) => ({
    steps: items.map((count) => ({ items: count })),
    untagged: { items: untagged },
  });

  it("is false with no answer anywhere, true with one in a step or untagged, null when not loaded", () => {
    expect(stepsHaveAnswers(counts([0, 0, 0]))).toBe(false);
    expect(stepsHaveAnswers(counts([0, 2, 0]))).toBe(true);
    expect(stepsHaveAnswers(counts([0, 0], 1))).toBe(true);
    expect(stepsHaveAnswers(null)).toBeNull();
  });
});
