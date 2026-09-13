import { describe, expect, it } from "vitest";
import type { CjmmStep } from "@/lib/ngn/types";
import { caseStudyBlockers, stepsReadyLabel, type CaseStudyStepState } from "./caseStudyReadiness";

const ready = (position: CjmmStep): CaseStudyStepState => ({
  position,
  itemId: `item_${position}`,
  itemReady: true,
});
const allReady = () => ([1, 2, 3, 4, 5, 6] as const).map(ready);

describe("caseStudyBlockers", () => {
  it("has nothing to say about a titled case study with a record and six ready steps", () => {
    expect(caseStudyBlockers({ titleWritten: true, recordTabCount: 2, steps: allReady() })).toEqual(
      [],
    );
  });

  it("names each missing step by number and clinical judgment step, in order", () => {
    const steps = allReady().filter((step) => step.position !== 3 && step.position !== 5);
    expect(caseStudyBlockers({ titleWritten: true, recordTabCount: 1, steps })).toEqual([
      "Step 3 (Prioritize Hypotheses) has no item yet.",
      "Step 5 (Take Action) has no item yet.",
    ]);
  });

  it("treats an empty slot and an absent step the same way", () => {
    const steps = allReady().map((step) =>
      step.position === 1 ? { ...step, itemId: null, itemReady: false } : step,
    );
    expect(caseStudyBlockers({ titleWritten: true, recordTabCount: 1, steps })).toEqual([
      "Step 1 (Recognize Cues) has no item yet.",
    ]);
  });

  it("asks for a placed item to be finished when it is not ready", () => {
    const steps = allReady().map((step) =>
      step.position === 2 ? { ...step, itemReady: false } : step,
    );
    expect(caseStudyBlockers({ titleWritten: true, recordTabCount: 1, steps })).toEqual([
      "Step 2 (Analyze Cues) needs its item finished and published.",
    ]);
  });

  it("puts the title and the record before the steps", () => {
    expect(caseStudyBlockers({ titleWritten: false, recordTabCount: 0, steps: [] })).toEqual([
      "Give the case study a title.",
      "Add at least one tab to the patient record.",
      "Step 1 (Recognize Cues) has no item yet.",
      "Step 2 (Analyze Cues) has no item yet.",
      "Step 3 (Prioritize Hypotheses) has no item yet.",
      "Step 4 (Generate Solutions) has no item yet.",
      "Step 5 (Take Action) has no item yet.",
      "Step 6 (Evaluate Outcomes) has no item yet.",
    ]);
  });
});

describe("caseStudyBlockers for an item set to another step", () => {
  it("names the step whose item is marked for a different clinical judgment step", () => {
    const steps = allReady().map((step) =>
      step.position === 4 ? { ...step, wrongStep: true } : step,
    );
    expect(caseStudyBlockers({ titleWritten: true, recordTabCount: 1, steps })).toEqual([
      "Step 4 (Generate Solutions)'s item is set to a different clinical judgment step. Place it again.",
    ]);
    expect(stepsReadyLabel(steps)).toBe("5 of 6 steps ready");
  });
});

describe("stepsReadyLabel", () => {
  it("counts only placed, ready steps", () => {
    const steps = allReady().map((step) =>
      step.position === 6 ? { ...step, itemReady: false } : step,
    );
    expect(stepsReadyLabel(steps.slice(0, 5))).toBe("5 of 6 steps ready");
    expect(stepsReadyLabel(steps)).toBe("5 of 6 steps ready");
    expect(stepsReadyLabel([])).toBe("0 of 6 steps ready");
  });
});
