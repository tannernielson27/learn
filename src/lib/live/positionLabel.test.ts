import { describe, expect, it } from "vitest";
import { initialSessionState, type LiveSessionState } from "./state";
import { positionLabel } from "./positionLabel";

const on = (position: number, itemCount = 6): LiveSessionState => ({
  ...initialSessionState(itemCount),
  status: "running",
  position,
});

describe("positionLabel (#184)", () => {
  it("says which item of how many in a bank session, as the console always has", () => {
    expect(positionLabel(on(3, 10), { caseStudy: false, cjmmStep: 5 })).toBe("Item 3 of 10");
  });

  it("names the CJMM step with the position in a case study", () => {
    expect(positionLabel(on(1), { caseStudy: true, cjmmStep: 1 })).toBe(
      "Step 1 of 6: Recognize Cues",
    );
    expect(positionLabel(on(6), { caseStudy: true, cjmmStep: 6 })).toBe(
      "Step 6 of 6: Evaluate Outcomes",
    );
  });

  it("takes the step from the item, which is what the case study says it is", () => {
    expect(positionLabel(on(2), { caseStudy: true, cjmmStep: 2 })).toBe(
      "Step 2 of 6: Analyze Cues",
    );
  });

  it("falls back to the position while the item has not arrived yet", () => {
    // A case study's steps are the six CJMM steps in order (caseStudySchema), so the position
    // is the step until the item says otherwise.
    expect(positionLabel(on(3), { caseStudy: true, cjmmStep: null })).toBe(
      "Step 3 of 6: Prioritize Hypotheses",
    );
  });

  it("says step without a name for a position past the sixth", () => {
    expect(positionLabel(on(7, 7), { caseStudy: true, cjmmStep: null })).toBe("Step 7 of 7");
  });

  it("is null in the lobby and for an empty set", () => {
    expect(positionLabel(initialSessionState(6), { caseStudy: true, cjmmStep: null })).toBeNull();
    expect(positionLabel(on(1, 0), { caseStudy: false, cjmmStep: null })).toBeNull();
  });
});
