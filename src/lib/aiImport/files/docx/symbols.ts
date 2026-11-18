/**
 * Characters Word stores in a symbol font (#592). "≥" typed from Insert > Symbol is the Symbol
 * font's character B3, and a check mark is often "ü" in Wingdings: read as plain text they are a
 * superscript three and a u-umlaut. Each font's own table says what the reader saw. Only the
 * characters a clinical document uses are listed; one that is not becomes `[symbol]`.
 */

/** The Symbol font: comparisons, arrows, units and the Greek letters. */
const SYMBOL: Readonly<Record<number, string>> = {
  0x2d: "−",
  0x40: "≅",
  0x44: "Δ",
  0x46: "Φ",
  0x47: "Γ",
  0x4c: "Λ",
  0x50: "Π",
  0x51: "Θ",
  0x53: "Σ",
  0x57: "Ω",
  0x58: "Ξ",
  0x59: "Ψ",
  0x61: "α",
  0x62: "β",
  0x63: "χ",
  0x64: "δ",
  0x65: "ε",
  0x66: "φ",
  0x67: "γ",
  0x68: "η",
  0x69: "ι",
  0x6b: "κ",
  0x6c: "λ",
  0x6d: "μ",
  0x6e: "ν",
  0x70: "π",
  0x71: "θ",
  0x72: "ρ",
  0x73: "σ",
  0x74: "τ",
  0x75: "υ",
  0x77: "ω",
  0x78: "ξ",
  0x79: "ψ",
  0x7a: "ζ",
  0x7e: "∼",
  0xa2: "′",
  0xa3: "≤",
  0xa4: "⁄",
  0xa5: "∞",
  0xab: "↔",
  0xac: "←",
  0xad: "↑",
  0xae: "→",
  0xaf: "↓",
  0xb0: "°",
  0xb1: "±",
  0xb2: "″",
  0xb3: "≥",
  0xb4: "×",
  0xb5: "∝",
  0xb7: "•",
  0xb8: "÷",
  0xb9: "≠",
  0xba: "≡",
  0xbb: "≈",
  0xbc: "…",
  // The radical sign, which documents use as a tick far more often than as a root.
  0xd6: "✓",
  0xd7: "⋅",
  0xdb: "⇔",
  0xdc: "⇐",
  0xdd: "⇑",
  0xde: "⇒",
  0xdf: "⇓",
};

const WINGDINGS: Readonly<Record<number, string>> = {
  0x6c: "●",
  0x6e: "■",
  0x6f: "☐",
  0x71: "☐",
  0x9f: "•",
  0xa7: "▪",
  0xa8: "☐",
  0xd8: "➢",
  0xdf: "←",
  0xe0: "→",
  0xe1: "↑",
  0xe2: "↓",
  0xe8: "→",
  0xef: "←",
  0xf0: "→",
  0xf1: "↑",
  0xf2: "↓",
  0xfb: "✗",
  0xfc: "✓",
  0xfd: "☒",
  0xfe: "☑",
};

const WINGDINGS_2: Readonly<Record<number, string>> = {
  0x4f: "✗",
  0x50: "✓",
  0x51: "☒",
  0x52: "☑",
  0x53: "☒",
  0xa3: "☐",
};

const FONTS: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  symbol: SYMBOL,
  wingdings: WINGDINGS,
  "wingdings 2": WINGDINGS_2,
};

/** What `w:sym` gave before fonts were read (#341): kept for a symbol with no font, or another. */
const ANY_FONT: Readonly<Record<number, string>> = {
  0x6f: "☐",
  0xa8: "☐",
  0xb7: "•",
  0xd6: "✓",
  0xfb: "✗",
  0xfc: "✓",
  0xfd: "☒",
  0xfe: "☑",
};

/** Word writes a symbol font's characters in the private-use block, at F000 plus their code. */
const PRIVATE_BASE = 0xf000;

const fontCode = (code: number): number =>
  code >= PRIVATE_BASE && code <= PRIVATE_BASE + 0xff ? code - PRIVATE_BASE : code;

/** A code point that is a real, printable character: not a control, a surrogate or private use. */
function isRealCharacter(code: number): boolean {
  if (code < 0xa0 || code > 0x10ffff) return false;
  if (code >= 0xd800 && code <= 0xdfff) return false;
  return !(code >= 0xe000 && code <= 0xf8ff);
}

/** The table's key for a font Word names ("Symbol", "Wingdings 2"); null for any other font. */
export function symbolFontKey(name: string | null): string | null {
  const key = (name ?? "").trim().toLowerCase();
  return Object.hasOwn(FONTS, key) ? key : null;
}

/** What a `<w:sym w:font w:char>` shows: by its font, then as the first version read it. */
export function symbolFor(font: string | null, charHex: string | null): string {
  if (!charHex || !/^[0-9A-Fa-f]{1,6}$/.test(charHex)) return "[symbol]";
  const raw = Number.parseInt(charHex, 16);
  const code = fontCode(raw);
  const key = symbolFontKey(font);
  const known = key ? FONTS[key][code] : undefined;
  if (known) return known;
  if (ANY_FONT[code]) return ANY_FONT[code];
  // A font such as MS Gothic or Segoe UI Symbol holds the real character at its own code.
  return key === null && isRealCharacter(raw) ? String.fromCodePoint(raw) : "[symbol]";
}

/**
 * The text of a run set in a symbol font: each character the font's table knows becomes what it
 * shows ("ü" in Wingdings is a check mark, "m" in Symbol is μ), and the rest is left as it is.
 */
export function symbolText(fontKey: string, text: string): string {
  const table = FONTS[fontKey];
  if (!table) return text;
  return Array.from(text, (char) => table[fontCode(char.codePointAt(0) ?? 0)] ?? char).join("");
}
