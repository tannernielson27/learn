import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_SIGN_IN, safeNextPath } from "./nextPath";

describe("safeNextPath", () => {
  it.each([
    ["/author", "/author"],
    ["/author/banks/123?tab=items#top", "/author/banks/123?tab=items#top"],
  ])("keeps a same-origin path: %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["author"], // relative, no leading slash
    ["//evil.example/author"], // protocol-relative
    ["/\\evil.example"], // browsers treat a backslash as a slash
    ["https://evil.example/author"],
    ["javascript:alert(1)"],
    ["/%2F%2Fevil.example"], // encoded protocol-relative
    ["/%5Cevil.example"], // encoded backslash
    ["/\t/evil.example"], // URL parsers strip tabs and newlines
    ["/sign-in"], // would loop back to sign-in
    ["/auth/confirm?token_hash=x"], // never bounce into the callback again
    ["/%"], // malformed escape
  ])("falls back to the author home for %j", (input) => {
    expect(safeNextPath(input)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it("caps absurdly long values", () => {
    expect(safeNextPath(`/author/${"a".repeat(3000)}`)).toBe(DEFAULT_AFTER_SIGN_IN);
  });

  it("sends people to the author home by default", () => {
    expect(DEFAULT_AFTER_SIGN_IN).toBe("/author");
  });
});
