import type { StyleInfo } from "./numbering";
import { symbolFontKey } from "./symbols";
import { attr, child, toggle, type Element } from "./xml";

/**
 * A run's formatting and how it is written as markup (#341, #592). Keys hide in formatting, so
 * everything a reader could take for a mark is kept: bold, italic, underline, strikethrough,
 * highlight, font colour, and text raised or lowered. Hidden text is dropped: the reader never
 * saw it. `DOCX_MARKUP` tells Claude what each mark means, and `sourceText.ts` ignores every one
 * of them when it compares what the model copied with the source.
 */

export interface Format {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** A highlight colour name (`yellow`), or a run shading fill (`#FFFF00`). */
  highlight: string | null;
  /** The font colour (`#C00000`), when it is a colour and not black, white or a grey. */
  colour: string | null;
  vertical: "super" | "sub" | null;
  /** `w:vanish`: text Word does not show or print. */
  hidden: boolean;
  /** The key of a symbol font the run is set in (`symbols.ts`), whose characters are not text. */
  symbolFont: string | null;
}

export type Piece = { kind: "text"; text: string; format: Format } | { kind: "image" };

export const PLAIN: Format = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  highlight: null,
  colour: null,
  vertical: null,
  hidden: false,
  symbolFont: null,
};

const COLOUR_NAME = /^[A-Za-z]{1,20}$/;
const HEX = /^[0-9A-Fa-f]{6}$/;

/** A shading fill as `#RRGGBB`; null for none, `auto` or white. */
export function fill(shd: Element | undefined): string | null {
  const value = attr(shd, "fill");
  if (!value || !HEX.test(value) || value.toUpperCase() === "FFFFFF") return null;
  return `#${value.toUpperCase()}`;
}

/** Channels closer together than this are black, white or a grey: body text, not a mark. */
const GREY_SPREAD = 0x20;

/** A font colour as `#RRGGBB`; null for `auto` and for any shade of grey. */
function fontColour(color: Element | undefined): string | null {
  const value = attr(color, "val");
  if (!value || !HEX.test(value)) return null;
  const channels = [0, 2, 4].map((at) => Number.parseInt(value.slice(at, at + 2), 16));
  if (Math.max(...channels) - Math.min(...channels) <= GREY_SPREAD) return null;
  return `#${value.toUpperCase()}`;
}

function vertical(el: Element | undefined): Format["vertical"] {
  const value = (attr(el, "val") ?? "").toLowerCase();
  if (value === "superscript") return "super";
  return value === "subscript" ? "sub" : null;
}

/** A toggle the run states itself, or what it inherits when it says nothing. */
const stated = (el: Element | undefined, inherited: boolean): boolean =>
  el ? toggle(el) : inherited;

/**
 * A run's format: its own properties, over its character style's bold, over the paragraph's
 * (`base`). Only bold is read from styles; a style's colour or underline says what kind of text
 * it is (a heading, a link), which is not what marks one option out.
 */
export function runFormat(
  rPr: Element | undefined,
  base: Format,
  styles: ReadonlyMap<string, StyleInfo>,
): Format {
  if (!rPr) return base;
  const named = attr(child(rPr, "highlight"), "val");
  const highlight =
    named && named.toLowerCase() !== "none" && COLOUR_NAME.test(named)
      ? named
      : fill(child(rPr, "shd"));
  const styleId = attr(child(rPr, "rStyle"), "val");
  const styleBold = styleId ? (styles.get(styleId)?.bold ?? null) : null;
  const fonts = child(rPr, "rFonts");
  return {
    bold: stated(child(rPr, "b"), styleBold ?? base.bold),
    italic: stated(child(rPr, "i"), base.italic),
    underline: stated(child(rPr, "u"), base.underline),
    strike: stated(child(rPr, "strike"), false) || stated(child(rPr, "dstrike"), false),
    highlight,
    colour: fontColour(child(rPr, "color")),
    vertical: vertical(child(rPr, "vertAlign")),
    hidden: stated(child(rPr, "vanish"), false),
    symbolFont: symbolFontKey(attr(fonts, "ascii")) ?? symbolFontKey(attr(fonts, "hAnsi")),
  };
}

const SUPERSCRIPT: Readonly<Record<string, string>> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "−": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
};

const SUBSCRIPT: Readonly<Record<string, string>> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "−": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
};

/** Word raises the letters of "1st" and "2nd" by itself; they are part of the word. */
const ORDINAL = /^(?:st|nd|rd|th)$/i;

/**
 * Raised or lowered text. "10" then a raised "3" must not read as 103, so the raised part is
 * written with Unicode's own superscripts (10³, Ca²⁺, SpO₂) where they exist, and as `^(text)` or
 * `_(text)` where they do not.
 */
export function verticalText(text: string, direction: "super" | "sub"): string {
  const core = text.trim();
  if (core === "") return text;
  if (direction === "super" && ORDINAL.test(core)) return text;
  const table = direction === "super" ? SUPERSCRIPT : SUBSCRIPT;
  const chars = Array.from(core);
  const mapped = chars.every((char) => table[char] !== undefined)
    ? chars.map((char) => table[char]).join("")
    : `${direction === "super" ? "^" : "_"}(${core})`;
  return text.replace(core, () => mapped);
}

/** Wraps `text` in markers, leaving its outer whitespace outside them. */
function wrap(text: string, open: string, close: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) as RegExpExecArray;
  const [, lead, core, trail] = match;
  return core ? `${lead}${open}${core}${close}${trail}` : text;
}

type TextPiece = Extract<Piece, { kind: "text" }>;

const sameEmphasis = (a: Format, b: Format): boolean =>
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.strike === b.strike;

function renderInner(pieces: readonly TextPiece[]): string {
  let out = "";
  let i = 0;
  while (i < pieces.length) {
    const { format } = pieces[i];
    let text = "";
    while (i < pieces.length && sameEmphasis(pieces[i].format, format)) {
      const piece = pieces[i];
      text += piece.format.vertical ? verticalText(piece.text, piece.format.vertical) : piece.text;
      i += 1;
    }
    if (format.underline) text = wrap(text, "<u>", "</u>");
    if (format.italic) text = wrap(text, "*", "*");
    if (format.bold) text = wrap(text, "**", "**");
    if (format.strike) text = wrap(text, "~~", "~~");
    out += text;
  }
  return out;
}

/** What follows a coloured stretch: `{yellow}`, `{color #C00000}` or `{yellow, color #C00000}`. */
function colourTag(format: Format): string | null {
  const parts = [format.highlight, format.colour ? `color ${format.colour}` : null].filter(
    (part): part is string => part !== null,
  );
  return parts.length > 0 ? `{${parts.join(", ")}}` : null;
}

/** A paragraph's pieces as markup: runs coloured alike are one stretch, emphasis inside it. */
export function renderPieces(pieces: readonly Piece[]): string {
  let out = "";
  let i = 0;
  while (i < pieces.length) {
    const piece = pieces[i];
    if (piece.kind === "image") {
      out += "[image]";
      i += 1;
      continue;
    }
    const tag = colourTag(piece.format);
    const group: TextPiece[] = [];
    while (i < pieces.length) {
      const next = pieces[i];
      if (next.kind !== "text" || colourTag(next.format) !== tag) break;
      group.push(next);
      i += 1;
    }
    const inner = renderInner(group);
    out += tag ? wrap(inner, "==", `==${tag}`) : inner;
  }
  return out;
}
