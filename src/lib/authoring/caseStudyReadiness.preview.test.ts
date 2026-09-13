import { describe, expect, it } from "vitest";
import type { CjmmStep } from "@/lib/ngn/types";
import { caseStudyBlockers } from "./caseStudyReadiness";

const steps = [1, 2, 3, 4, 5, 6].map((position) => ({
  position: position as CjmmStep,
  itemId: `item-${position}`,
  itemReady: position !== 3,
}));

describe("caseStudyBlockers for a preview", () => {
  it("asks for an unfinished step's item to be finished, not published", () => {
    expect(caseStudyBlockers({ titleWritten: true, recordTabCount: 1, steps }, "preview")).toEqual([
      "Step 3 (Prioritize Hypotheses) needs its item finished.",
    ]);
  });

  it("still asks for it to be published when publishing", () => {
    expect(caseStudyBlockers({ titleWritten: true, recordTabCount: 1, steps })).toEqual([
      "Step 3 (Prioritize Hypotheses) needs its item finished and published.",
    ]);
    expect(caseStudyBlockers({ titleWritten: true, recordTabCount: 1, steps }, "publish")).toEqual([
      "Step 3 (Prioritize Hypotheses) needs its item finished and published.",
    ]);
  });
});
