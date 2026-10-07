import { describe, expect, it } from "vitest";
import {
  CLASS_CODE_ALPHABET,
  CLASS_CODE_LENGTH,
  formatClassCode,
  isClassCode,
  normalizeClassCode,
} from "./classCode";
import { formatSessionCode } from "@/lib/live/sessionCode";

describe("the class-code alphabet", () => {
  it("leaves out every character that can be read as another", () => {
    for (const ambiguous of ["0", "O", "1", "I", "L"]) {
      expect(CLASS_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it("holds 31 distinct upper-case letters and digits", () => {
    expect(CLASS_CODE_ALPHABET).toHaveLength(31);
    expect(new Set(CLASS_CODE_ALPHABET).size).toBe(31);
    expect(CLASS_CODE_ALPHABET).toMatch(/^[2-9A-Z]+$/);
  });

  it("is eight characters long", () => {
    expect(CLASS_CODE_LENGTH).toBe(8);
  });
});

describe("normalizeClassCode", () => {
  it("upper-cases what was typed and drops spaces and hyphens", () => {
    expect(normalizeClassCode(" abcd - efgh ")).toBe("ABCDEFGH");
  });

  it("keeps any other character, so it cannot turn a wrong code into a right one", () => {
    expect(normalizeClassCode("AB/CDEFGH")).toBe("AB/CDEFGH");
  });
});

describe("isClassCode", () => {
  it("accepts eight characters from the alphabet", () => {
    expect(isClassCode("ABCD2345")).toBe(true);
  });

  it("refuses a look-alike, a wrong length or lower case", () => {
    expect(isClassCode("ABCD234L")).toBe(false);
    expect(isClassCode("ABCD234O")).toBe(false);
    expect(isClassCode("ABCD234")).toBe(false);
    expect(isClassCode("ABCD23456")).toBe(false);
    expect(isClassCode("abcd2345")).toBe(false);
  });
});

describe("formatClassCode", () => {
  it("shows two groups of four joined by a hyphen", () => {
    expect(formatClassCode("ABCD2345")).toBe("ABCD-2345");
    expect(formatClassCode("abcd 2345")).toBe("ABCD-2345");
  });

  it("cannot be mistaken for a live session's code", () => {
    expect(formatSessionCode("ABC234")).toBe("ABC 234");
    expect(formatClassCode("ABCD2345")).not.toMatch(/^\S{3} \S{3}$/);
  });

  it("shows anything that is not a code as it was given", () => {
    expect(formatClassCode("not a code")).toBe("not a code");
  });
});
