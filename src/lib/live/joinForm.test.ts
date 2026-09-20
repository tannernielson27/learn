import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_EMPTY, DISPLAY_NAME_TOO_LONG } from "./displayName";
import { JOIN_CODE_ERROR, parseJoinForm } from "./joinForm";

function form(code: unknown, displayName: unknown): FormData {
  const data = new FormData();
  if (typeof code === "string") data.set("code", code);
  if (typeof displayName === "string") data.set("displayName", displayName);
  return data;
}

describe("parseJoinForm", () => {
  it("reads a code and a name", () => {
    expect(parseJoinForm(form("7KQ2MZ", "Sam Okafor"))).toEqual({
      ok: true,
      code: "7KQ2MZ",
      displayName: "Sam Okafor",
    });
  });

  it("forgives the case, spaces and hyphens people copy off a screen", () => {
    for (const typed of ["7kq2mz", "7KQ 2MZ", "7kq-2mz", "  7 K Q 2 M Z  "]) {
      expect(parseJoinForm(form(typed, "Sam"))).toEqual({
        ok: true,
        code: "7KQ2MZ",
        displayName: "Sam",
      });
    }
  });

  it("refuses a code that could not name a session, without spending a round trip", () => {
    for (const typed of ["", "7KQ2M", "7KQ2MZX", "7KQ2M0", "IOIOIO"]) {
      expect(parseJoinForm(form(typed, "Sam"))).toEqual({
        ok: false,
        field: "code",
        error: JOIN_CODE_ERROR,
      });
    }
  });

  it("refuses a missing code, which is what a posted form without the field looks like", () => {
    expect(parseJoinForm(form(null, "Sam"))).toEqual({
      ok: false,
      field: "code",
      error: JOIN_CODE_ERROR,
    });
  });

  it("checks the code first, so a bad code is named even when the name is bad too", () => {
    expect(parseJoinForm(form("nope", ""))).toEqual({
      ok: false,
      field: "code",
      error: JOIN_CODE_ERROR,
    });
  });

  it("passes the name's own refusals through, pointing at the name field", () => {
    expect(parseJoinForm(form("7KQ2MZ", "   "))).toEqual({
      ok: false,
      field: "displayName",
      error: DISPLAY_NAME_EMPTY,
    });
    expect(parseJoinForm(form("7KQ2MZ", "a".repeat(33)))).toEqual({
      ok: false,
      field: "displayName",
      error: DISPLAY_NAME_TOO_LONG,
    });
  });

  it("cleans the name it returns, so nothing downstream has to remember to", () => {
    const parsed = parseJoinForm(form("7KQ2MZ", "  Sam   Okafor "));
    expect(parsed.ok && parsed.displayName).toBe("Sam Okafor");
  });
});
