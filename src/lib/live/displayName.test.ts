import { describe, expect, it } from "vitest";
import {
  cleanDisplayName,
  DISPLAY_NAME_EMPTY,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_TOO_LONG,
  displayNameLength,
  parseDisplayName,
} from "./displayName";

/** Named rather than pasted, so the source of this file carries no invisible characters. */
const character = (codePoint: number) => String.fromCodePoint(codePoint);
const SOFT_HYPHEN = character(0x00ad);
const ZERO_WIDTH_SPACE = character(0x200b);
const ZERO_WIDTH_JOINER = character(0x200d);
const ZERO_WIDTH_NON_JOINER = character(0x200c);
const RIGHT_TO_LEFT_OVERRIDE = character(0x202e);
const POP_DIRECTIONAL = character(0x202c);
const WORD_JOINER = character(0x2060);
const BYTE_ORDER_MARK = character(0xfeff);
const LINE_SEPARATOR = character(0x2028);
const NO_BREAK_SPACE = character(0x00a0);
const IDEOGRAPHIC_SPACE = character(0x3000);

describe("cleanDisplayName", () => {
  it("leaves an ordinary name alone", () => {
    expect(cleanDisplayName("Sam Okafor")).toBe("Sam Okafor");
  });

  it("trims and collapses whitespace, including the kinds a keyboard does not type", () => {
    expect(cleanDisplayName("   Sam    Okafor  ")).toBe("Sam Okafor");
    expect(cleanDisplayName(`Sam${NO_BREAK_SPACE}${IDEOGRAPHIC_SPACE}Okafor`)).toBe("Sam Okafor");
    expect(cleanDisplayName("\tSam\nOkafor\r\n")).toBe("Sam Okafor");
  });

  it("removes control characters rather than letting them through to a log or a terminal", () => {
    expect(cleanDisplayName(`Sam${character(0x07)}Okafor`)).toBe("SamOkafor");
    expect(cleanDisplayName(`Sam${character(0x7f)}`)).toBe("Sam");
  });

  it("removes the invisible formatting a name could hide or reorder text with", () => {
    for (const hidden of [
      SOFT_HYPHEN,
      ZERO_WIDTH_SPACE,
      RIGHT_TO_LEFT_OVERRIDE,
      POP_DIRECTIONAL,
      WORD_JOINER,
      BYTE_ORDER_MARK,
      LINE_SEPARATOR,
    ]) {
      expect(cleanDisplayName(`Sam${hidden}Okafor`)).toBe("SamOkafor");
    }
  });

  it("keeps the joiners, because they are spelling and not formatting", () => {
    expect(cleanDisplayName(`Sam${ZERO_WIDTH_JOINER}Okafor`)).toBe(`Sam${ZERO_WIDTH_JOINER}Okafor`);
    expect(cleanDisplayName(`Sam${ZERO_WIDTH_NON_JOINER}Okafor`)).toBe(
      `Sam${ZERO_WIDTH_NON_JOINER}Okafor`,
    );
  });

  it("normalizes with NFKC, so a name built from lookalike forms folds onto the plain one", () => {
    // Fullwidth Latin, then the mathematical bold alphabet. Built from code points rather than
    // pasted, because Prettier rewrites a \u escape in a string to the character it names.
    const fullwidth = [0xff29, 0xff4e, 0xff53, 0xff54].map(character).join("");
    const mathematicalBold = [0x1d408, 0x1d427, 0x1d42c, 0x1d42d].map(character).join("");
    expect(fullwidth).not.toBe("Inst");
    expect(mathematicalBold).not.toBe("Inst");
    expect(cleanDisplayName(fullwidth)).toBe("Inst");
    expect(cleanDisplayName(mathematicalBold)).toBe("Inst");
  });

  it("composes the two ways of writing an accented letter into the same name", () => {
    const composed = `Ren${character(0x00e9)}`;
    const decomposed = `Rene${character(0x0301)}`;
    expect(decomposed).not.toBe(composed);
    expect(cleanDisplayName(decomposed)).toBe(cleanDisplayName(composed));
  });

  it("can empty a name entirely, and says so by returning nothing", () => {
    expect(cleanDisplayName(`  ${ZERO_WIDTH_SPACE} ${SOFT_HYPHEN} `)).toBe("");
    expect(cleanDisplayName("")).toBe("");
  });
});

describe("displayNameLength", () => {
  it("counts characters a reader would count, not UTF-16 units", () => {
    expect(displayNameLength("Sam")).toBe(3);
    // One astral character is two UTF-16 units and one character.
    expect("\u{1d408}".length).toBe(2);
    expect(displayNameLength("\u{1d408}")).toBe(1);
  });
});

describe("parseDisplayName", () => {
  it("accepts a name and returns it cleaned", () => {
    expect(parseDisplayName("  Sam   Okafor ")).toEqual({ ok: true, value: "Sam Okafor" });
  });

  it("refuses anything that is not a string, which is what a forged form can post", () => {
    expect(parseDisplayName(null)).toEqual({ ok: false, error: DISPLAY_NAME_EMPTY });
    expect(parseDisplayName(undefined)).toEqual({ ok: false, error: DISPLAY_NAME_EMPTY });
    expect(parseDisplayName(new File([], "name.txt"))).toEqual({
      ok: false,
      error: DISPLAY_NAME_EMPTY,
    });
  });

  it("refuses a name that cleaning leaves empty", () => {
    expect(parseDisplayName(`   ${ZERO_WIDTH_SPACE}  `)).toEqual({
      ok: false,
      error: DISPLAY_NAME_EMPTY,
    });
  });

  it("takes a name exactly at the cap and refuses one past it", () => {
    const atCap = "a".repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(parseDisplayName(atCap)).toEqual({ ok: true, value: atCap });
    expect(parseDisplayName(`${atCap}a`)).toEqual({ ok: false, error: DISPLAY_NAME_TOO_LONG });
  });

  it("measures the cap after cleaning, so padding never costs anyone their name", () => {
    const spaced = `  ${"a".repeat(DISPLAY_NAME_MAX_LENGTH)}   `;
    expect(parseDisplayName(spaced).ok).toBe(true);
  });

  it("counts the cap in characters, so a name of astral characters is not cut short", () => {
    const astral = "\u{1d408}".repeat(DISPLAY_NAME_MAX_LENGTH);
    // NFKC folds each of these onto a plain letter, so the cap is met either way; what matters is
    // that the count is of characters and not of the 64 UTF-16 units.
    expect(parseDisplayName(astral).ok).toBe(true);
    // An emoji has no compatibility form to fold onto, so it stays astral.
    expect(parseDisplayName("\u{1f9d1}".repeat(DISPLAY_NAME_MAX_LENGTH)).ok).toBe(true);
    expect(parseDisplayName("\u{1f9d1}".repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: DISPLAY_NAME_TOO_LONG,
    });
  });
});
