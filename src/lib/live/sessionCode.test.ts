import { describe, expect, it } from "vitest";
import {
  formatSessionCode,
  isSessionCode,
  normalizeSessionCode,
  SESSION_CODE_ALPHABET,
  SESSION_CODE_LENGTH,
} from "./sessionCode";

describe("the join-code alphabet", () => {
  it("leaves out every character that can be read as another", () => {
    for (const ambiguous of ["O", "0", "I", "1"]) {
      expect(SESSION_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it("holds 32 distinct characters, which is what makes a random byte unbiased", () => {
    expect(SESSION_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(SESSION_CODE_ALPHABET).size).toBe(32);
  });
});

describe("normalizeSessionCode", () => {
  it("upper-cases what was typed", () => {
    expect(normalizeSessionCode("aj4k7p")).toBe("AJ4K7P");
  });

  it("forgives the spaces and hyphens people put between the halves", () => {
    expect(normalizeSessionCode(" AJ4 - K7P ")).toBe("AJ4K7P");
  });

  it("drops anything that could not be part of a code", () => {
    expect(normalizeSessionCode("AJ4/K7P!")).toBe("AJ4K7P");
  });

  it("returns nothing for nothing", () => {
    expect(normalizeSessionCode("")).toBe("");
  });
});

describe("isSessionCode", () => {
  it("accepts a code of the right length from the alphabet", () => {
    expect(isSessionCode("AJ4K7P")).toBe(true);
  });

  it("refuses a code holding an ambiguous character", () => {
    expect(isSessionCode("AJ4K7O")).toBe(false);
    expect(isSessionCode("AJ4K71")).toBe(false);
  });

  it("refuses anything that is not exactly six characters", () => {
    expect(isSessionCode("AJ4K7")).toBe(false);
    expect(isSessionCode("AJ4K7PQ")).toBe(false);
    expect(isSessionCode("")).toBe(false);
  });

  it("refuses lower case, because it checks the normalized form", () => {
    expect(isSessionCode("aj4k7p")).toBe(false);
    expect(isSessionCode(normalizeSessionCode("aj4k7p"))).toBe(true);
  });

  it("agrees with the declared length", () => {
    expect(SESSION_CODE_LENGTH).toBe(6);
    expect(isSessionCode(SESSION_CODE_ALPHABET.slice(0, SESSION_CODE_LENGTH))).toBe(true);
  });
});

describe("formatSessionCode", () => {
  it("splits a code into two groups of three", () => {
    expect(formatSessionCode("AJ4K7P")).toBe("AJ4 K7P");
  });

  it("normalizes before grouping, so a round trip through the form is stable", () => {
    expect(formatSessionCode("aj4-k7p")).toBe("AJ4 K7P");
  });

  it("leaves something that is not a code alone rather than inventing a grouping", () => {
    expect(formatSessionCode("AJ4")).toBe("AJ4");
  });
});
