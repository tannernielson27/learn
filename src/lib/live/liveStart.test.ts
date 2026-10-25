import { describe, expect, it } from "vitest";
import { caseStudyLiveStartMessage, classLiveStartMessage, LIVE_CLASS_REFUSAL } from "./liveStart";

describe("caseStudyLiveStartMessage (#184)", () => {
  it("says nothing when no start was refused", () => {
    expect(caseStudyLiveStartMessage(undefined)).toBeUndefined();
  });

  it("says what to publish when the database finds a step it will not run", () => {
    expect(caseStudyLiveStartMessage("empty")).toBe(
      "Publish this case study and its six questions before starting a live session.",
    );
  });

  it("says the case study is gone, and says try again for anything else", () => {
    expect(caseStudyLiveStartMessage("gone")).toBe("That case study no longer exists.");
    expect(caseStudyLiveStartMessage("failed")).toBe(
      "The live session could not be started. Try again.",
    );
    expect(caseStudyLiveStartMessage("<script>")).toBe(
      "The live session could not be started. Try again.",
    );
  });

  it("says the class is not the teacher's when start_session refuses it (ADR 0013)", () => {
    expect(caseStudyLiveStartMessage("class")).toBe(LIVE_CLASS_REFUSAL);
    expect(LIVE_CLASS_REFUSAL).toBe("That class is not in your workspace. Choose another class.");
  });

  it("reads the first of a repeated query parameter", () => {
    expect(caseStudyLiveStartMessage(["gone", "empty"])).toBe("That case study no longer exists.");
  });
});

describe("classLiveStartMessage", () => {
  it("says nothing when no start was refused", () => {
    expect(classLiveStartMessage(undefined)).toBeUndefined();
  });

  it("says what went wrong in words of its own, and never echoes the address", () => {
    expect(classLiveStartMessage("quiz")).toBe("Choose a quiz to start.");
    expect(classLiveStartMessage("empty")).toBe(
      "Publish a question in that quiz before starting a live session.",
    );
    expect(classLiveStartMessage("gone")).toBe("That quiz no longer exists. Choose another quiz.");
    expect(classLiveStartMessage(["class", "gone"])).toBe("This class is not in your workspace.");
    expect(classLiveStartMessage("<script>")).toBe(
      "The live session could not be started. Try again.",
    );
  });
});
