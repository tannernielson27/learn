import { describe, expect, it } from "vitest";
import { practicePath, practiceProgressLabel } from "./paths";

describe("practicePath", () => {
  it("is under the student home", () => {
    expect(practicePath("b1")).toBe("/learn/practice/b1");
  });
});

describe("practiceProgressLabel", () => {
  it.each([
    [{ itemCount: 12, answered: 0 }, "12 items"],
    [{ itemCount: 1, answered: 0 }, "1 item"],
    [{ itemCount: 12, answered: 3 }, "3 of 12 done"],
    [{ itemCount: 12, answered: 12 }, "All 12 done"],
  ])("%o reads %s", (bank, label) => {
    expect(practiceProgressLabel(bank)).toBe(label);
  });
});
