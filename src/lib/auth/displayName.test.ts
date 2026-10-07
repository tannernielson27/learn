import { describe, expect, it } from "vitest";
import {
  ACCOUNT_NAME_EMPTY,
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_NAME_TOO_LONG,
  displayNameRule,
  parseAccountName,
  shownName,
} from "./displayName";

describe("displayNameRule", () => {
  it("keeps a name, trimmed", () => {
    expect(displayNameRule.parse("  Ana Lucía Reyes  ")).toBe("Ana Lucía Reyes");
  });

  it("refuses an empty name, or one that is only spaces", () => {
    for (const typed of ["", "   ", "\t\n"]) {
      const parsed = displayNameRule.safeParse(typed);
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues[0]?.message).toBe(ACCOUNT_NAME_EMPTY);
    }
  });

  it("refuses a name over 80 characters rather than cutting it", () => {
    expect(displayNameRule.safeParse("a".repeat(ACCOUNT_NAME_MAX_LENGTH)).success).toBe(true);
    const parsed = displayNameRule.safeParse("a".repeat(ACCOUNT_NAME_MAX_LENGTH + 1));
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(ACCOUNT_NAME_TOO_LONG);
  });

  it("counts characters as a reader does, as the database's length() does", () => {
    // U+20000 is two UTF-16 units and one character.
    const name = "\u{20000}".repeat(ACCOUNT_NAME_MAX_LENGTH);
    expect(displayNameRule.parse(name)).toBe(name);
  });

  it("strips control characters and direction overrides", () => {
    expect(displayNameRule.parse("Ana\u0000 \u0007Reyes\u202e")).toBe("Ana Reyes");
    expect(displayNameRule.parse("Ana\u0085\nReyes")).toBe("Ana Reyes");
    // A name made only of control characters is no name at all.
    expect(displayNameRule.safeParse("\u0000\u001b\u202e").success).toBe(false);
  });

  it("refuses anything that is not text", () => {
    expect(displayNameRule.safeParse(null).success).toBe(false);
    expect(displayNameRule.safeParse(new File(["x"], "x.txt")).success).toBe(false);
  });
});

describe("parseAccountName", () => {
  it("reads a form value into a name or the message to show", () => {
    expect(parseAccountName(" Sam ")).toEqual({ ok: true, name: "Sam" });
    expect(parseAccountName(null)).toEqual({ ok: false, error: ACCOUNT_NAME_EMPTY });
    expect(parseAccountName("x".repeat(81))).toEqual({ ok: false, error: ACCOUNT_NAME_TOO_LONG });
  });
});

describe("shownName", () => {
  it("is the name when there is one and the email otherwise", () => {
    expect(shownName({ displayName: "Sam Lee", email: "sam@school.edu" })).toBe("Sam Lee");
    expect(shownName({ displayName: null, email: "sam@school.edu" })).toBe("sam@school.edu");
    expect(shownName({ displayName: "   ", email: "sam@school.edu" })).toBe("sam@school.edu");
  });
});
