import { describe, expect, it } from "vitest";
import { INVITE_ADDRESS_ERROR, parseInviteAddress } from "./inviteAddress";

/**
 * The address a teacher types for a colleague. It is checked here before the database sees it,
 * and more strictly than the database checks: the address is printed in an email and on a page.
 */
describe("parseInviteAddress", () => {
  it("takes an ordinary address, lower-cased and trimmed of spaces", () => {
    expect(parseInviteAddress("  Kim.Lee+ngn@School.EDU ")).toEqual({
      ok: true,
      email: "kim.lee+ngn@school.edu",
    });
  });

  it.each([
    ["nothing", ""],
    ["only spaces", "   "],
    ["no at sign", "kim.school.edu"],
    ["no dot in the domain", "kim@school"],
    ["two addresses with a comma", "kim@school.edu,lee@school.edu"],
    ["two addresses with a semicolon", "kim@school.edu;lee@school.edu"],
    ["a display name in angle brackets", "Kim <kim@school.edu>"],
    ["an opening angle bracket", "<kim@school.edu"],
    ["a closing angle bracket", "kim>@school.edu"],
    ["a double quote", '"kim"@school.edu'],
    ["a comment in parentheses", "kim(teacher)@school.edu"],
    ["a closing parenthesis", "kim)@school.edu"],
    ["a backslash", "kim\\lee@school.edu"],
    ["a space inside", "kim lee@school.edu"],
    ["a line feed inside", "kim@school.edu\nbcc:x@evil.test"],
    ["a trailing line feed", "kim@school.edu\n"],
    ["a carriage return", "kim@school.edu\r"],
    ["a tab", "\tkim@school.edu"],
    ["a null byte", "kim\u0000@school.edu"],
    ["a delete character", "kim\u007f@school.edu"],
    ["a C1 control character", "kim\u0085@school.edu"],
  ])("refuses %s", (_what, value) => {
    expect(parseInviteAddress(value)).toEqual({ ok: false, error: INVITE_ADDRESS_ERROR });
  });

  it("refuses an address over 254 characters, and takes one of exactly 254", () => {
    const domain = "@school.edu";
    const longest = "a".repeat(254 - domain.length) + domain;
    expect(parseInviteAddress(longest)).toEqual({ ok: true, email: longest });
    expect(parseInviteAddress(`a${longest}`)).toEqual({ ok: false, error: INVITE_ADDRESS_ERROR });
  });

  it.each([
    ["a file", new File(["x"], "x.txt")],
    ["null", null],
    ["a number", 7],
    ["an object", { email: "kim@school.edu" }],
  ])("refuses %s in place of a string", (_what, value) => {
    expect(parseInviteAddress(value)).toEqual({ ok: false, error: INVITE_ADDRESS_ERROR });
  });
});
