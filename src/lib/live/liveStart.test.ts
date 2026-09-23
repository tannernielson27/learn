import { describe, expect, it } from "vitest";
import { caseStudyLiveStartMessage } from "./liveStart";

describe("caseStudyLiveStartMessage (#184)", () => {
  it("says nothing when no start was refused", () => {
    expect(caseStudyLiveStartMessage(undefined)).toBeUndefined();
  });

  it("says what to publish when the database finds a step it will not run", () => {
    expect(caseStudyLiveStartMessage("empty")).toBe(
      "Publish this case study and all six of its steps before starting a live session.",
    );
  });

  it("says the case study is gone, and says try again for anything else", () => {
    expect(caseStudyLiveStartMessage("gone")).toBe("That case study no longer exists.");
    expect(caseStudyLiveStartMessage("failed")).toBe(
      "The session could not be started. Try again.",
    );
    expect(caseStudyLiveStartMessage("<script>")).toBe(
      "The session could not be started. Try again.",
    );
  });

  it("reads the first of a repeated query parameter", () => {
    expect(caseStudyLiveStartMessage(["gone", "empty"])).toBe("That case study no longer exists.");
  });
});
