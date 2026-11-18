import { describe, expect, it } from "vitest";
import { cutEnd, cutMiddle, cutStart, shareBudget } from "./textCut";

/**
 * What Postgres checks: the text must survive being encoded. Half a character (a surrogate that
 * has lost its other half) does not, and `encodeURIComponent` throws on it.
 */
const wellFormed = (text: string) => expect(() => encodeURIComponent(text)).not.toThrow();

describe("cutEnd and cutStart", () => {
  it("leave a text that fits as it is", () => {
    expect(cutEnd("short", 20)).toBe("short");
    expect(cutStart("short", 20)).toBe("short");
  });

  it("never cut between the two halves of one character", () => {
    const text = "ab😀cd"; // the face takes two units, at 2 and 3
    expect(cutEnd(text, 3)).toBe("ab");
    expect(cutEnd(text, 4)).toBe("ab😀");
    expect(cutStart(text, 3)).toBe("cd");
    expect(cutStart(text, 4)).toBe("😀cd");
    for (let max = 0; max <= text.length; max += 1) {
      wellFormed(cutEnd(text, max));
      wellFormed(cutStart(text, max));
    }
    // The control: a plain slice at the same place does leave half a character.
    expect(() => encodeURIComponent(text.slice(0, 3))).toThrow();
  });

  it("give nothing for no room", () => {
    expect(cutEnd("text", 0)).toBe("");
    expect(cutStart("text", -1)).toBe("");
  });
});

describe("cutMiddle", () => {
  it("keeps the start and the end, and marks what was taken out", () => {
    const text = `Stem. ${"filler ".repeat(40)}Answer: B`;
    const cut = cutMiddle(text, 60, " […] ");
    expect(cut).toHaveLength(60);
    expect(cut.startsWith("Stem. ")).toBe(true);
    expect(cut.endsWith("Answer: B")).toBe(true);
    expect(cut).toContain(" […] ");
    expect(cutMiddle("fits", 60, " […] ")).toBe("fits");
  });

  it("cuts on whole characters at both edges", () => {
    const text = "😀".repeat(40);
    for (let max = 6; max < 40; max += 1) wellFormed(cutMiddle(text, max, "[…]"));
  });

  it("falls back to the start when there is no room for the marker", () => {
    expect(cutMiddle("abcdefgh", 3, "[…]")).toBe("abc");
  });
});

describe("shareBudget", () => {
  it("lets short parts keep everything and shares the rest between the long ones", () => {
    expect(shareBudget([10, 500, 20, 500], 300)).toEqual([10, 135, 20, 135]);
    expect(shareBudget([10, 20], 300)).toEqual([10, 20]);
    expect(shareBudget([100, 100, 100], 30)).toEqual([10, 10, 10]);
    expect(shareBudget([], 30)).toEqual([]);
  });

  it("never gives out more than there is", () => {
    const budget = shareBudget([7000, 1, 9000, 3000, 12000, 50], 20_000);
    expect(budget.reduce((sum, n) => sum + n, 0)).toBeLessThanOrEqual(20_000);
    expect(budget[1]).toBe(1);
    expect(budget[5]).toBe(50);
  });
});
