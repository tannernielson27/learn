import { describe, expect, it } from "vitest";
import { answerRate } from "./endSummary";

describe("answerRate", () => {
  it("is the answers sent out of every answer that could have been, as a whole percent", () => {
    // Three questions run, four people in: twelve could have answered, eleven did.
    expect(answerRate({ 1: 4, 2: 4, 3: 3 }, 3, 4)).toBe(92);
  });

  it("is unknown when this screen did not hear every question's count", () => {
    expect(answerRate({ 1: 4, 3: 3 }, 3, 4)).toBeNull();
  });

  it("is unknown with nobody in the session or no question run", () => {
    expect(answerRate({}, 0, 4)).toBeNull();
    expect(answerRate({ 1: 0 }, 1, 0)).toBeNull();
  });

  it("never reads more than all of them, even when people left and others joined", () => {
    expect(answerRate({ 1: 6 }, 1, 4)).toBe(100);
  });
});
