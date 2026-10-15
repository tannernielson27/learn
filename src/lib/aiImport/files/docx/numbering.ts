import { attr, child, elements, type Document, type Element } from "./xml";

/**
 * List numbers and heading levels (#341). Word stores a list item as a reference into
 * `word/numbering.xml`; the number a reader sees ("2.", "b)") is computed here, since keys such
 * as "Correct order: 2, 1, 3" or "Answer: B" refer to it.
 */

interface Level {
  start: number;
  format: string;
  text: string;
}

interface NumDefinition {
  levels: Map<number, Level>;
}

const DEFAULT_LEVEL: Level = { start: 1, format: "decimal", text: "" };

function intAttr(el: Element | undefined, name: string): number | null {
  const value = attr(el, name);
  if (value === null || !/^-?\d{1,6}$/.test(value)) return null;
  return Number(value);
}

function readLevel(lvl: Element): Level {
  return {
    start: intAttr(child(lvl, "start"), "val") ?? 1,
    format: attr(child(lvl, "numFmt"), "val") ?? "decimal",
    text: attr(child(lvl, "lvlText"), "val") ?? "",
  };
}

function toLetters(n: number): string {
  // Word's letters repeat after z: a … z, aa … zz.
  if (n < 1) return String(n);
  const letter = String.fromCharCode(97 + ((n - 1) % 26));
  return letter.repeat(Math.floor((n - 1) / 26) + 1);
}

function toRoman(n: number): string {
  if (n < 1 || n > 3999) return String(n);
  const table: [number, string][] = [
    [1000, "m"],
    [900, "cm"],
    [500, "d"],
    [400, "cd"],
    [100, "c"],
    [90, "xc"],
    [50, "l"],
    [40, "xl"],
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  let rest = n;
  let out = "";
  for (const [value, symbol] of table) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

function formatNumber(n: number, format: string): string {
  switch (format) {
    case "lowerLetter":
      return toLetters(n);
    case "upperLetter":
      return toLetters(n).toUpperCase();
    case "lowerRoman":
      return toRoman(n);
    case "upperRoman":
      return toRoman(n).toUpperCase();
    case "decimalZero":
      return String(n).padStart(2, "0");
    case "none":
      return "";
    default:
      return String(n);
  }
}

/** Reads numbering.xml once and hands out each list item's label, counting as Word does. */
export class Numbering {
  private readonly nums = new Map<string, NumDefinition>();
  private readonly counters = new Map<string, number[]>();

  constructor(doc: Document | null) {
    if (!doc?.documentElement) return;
    const abstracts = new Map<string, Map<number, Level>>();
    const root = doc.documentElement;
    for (const el of elements(root)) {
      if (el.localName !== "abstractNum") continue;
      const levels = new Map<number, Level>();
      for (const lvl of elements(el)) {
        const ilvl = intAttr(lvl, "ilvl");
        if (lvl.localName === "lvl" && ilvl !== null) levels.set(ilvl, readLevel(lvl));
      }
      abstracts.set(attr(el, "abstractNumId") ?? "", levels);
    }
    for (const el of elements(root)) {
      if (el.localName !== "num") continue;
      const base = abstracts.get(attr(child(el, "abstractNumId"), "val") ?? "") ?? new Map();
      const levels = new Map(base);
      for (const override of elements(el)) {
        const ilvl = intAttr(override, "ilvl");
        if (override.localName !== "lvlOverride" || ilvl === null) continue;
        const replaced = child(override, "lvl");
        const start = intAttr(child(override, "startOverride"), "val");
        const level = replaced ? readLevel(replaced) : (levels.get(ilvl) ?? DEFAULT_LEVEL);
        levels.set(ilvl, start === null ? level : { ...level, start });
      }
      this.nums.set(attr(el, "numId") ?? "", { levels });
    }
  }

  /** The label for the next item of list `numId` at `ilvl`, or null when it is not a list. */
  next(numId: string, ilvl: number): string | null {
    const definition = this.nums.get(numId);
    if (!definition || numId === "0") return null;
    const level = Math.max(0, Math.min(8, ilvl));
    const counts = [...(this.counters.get(numId) ?? [])];
    const current = definition.levels.get(level) ?? DEFAULT_LEVEL;
    counts[level] = counts[level] === undefined ? current.start : counts[level] + 1;
    counts.length = level + 1; // a deeper level starts again after this item
    this.counters.set(numId, counts);

    if (current.format === "bullet") return "-";
    const label = current.text.replace(/%([1-9])/g, (_, digit: string) => {
      const at = Number(digit) - 1;
      const lvl = definition.levels.get(at) ?? DEFAULT_LEVEL;
      return formatNumber(counts[at] ?? lvl.start, lvl.format);
    });
    return label || formatNumber(counts[level], current.format) || null;
  }
}

/** Heading levels by paragraph style id, from styles.xml, plus each style's own list. */
export interface StyleInfo {
  heading: number | null;
  numId: string | null;
  ilvl: number;
}

export function readStyles(doc: Document | null): Map<string, StyleInfo> {
  const styles = new Map<string, StyleInfo>();
  if (!doc?.documentElement) return styles;
  for (const el of elements(doc.documentElement)) {
    if (el.localName !== "style") continue;
    const id = attr(el, "styleId");
    if (!id) continue;
    const name = (attr(child(el, "name"), "val") ?? "").toLowerCase();
    const numPr = child(child(el, "pPr"), "numPr");
    styles.set(id, {
      heading: headingFromName(name),
      numId: attr(child(numPr, "numId"), "val"),
      ilvl: intAttr(child(numPr, "ilvl"), "val") ?? 0,
    });
  }
  return styles;
}

function headingFromName(name: string): number | null {
  if (name === "title") return 1;
  const match = /^heading\s?([1-6])$/.exec(name);
  return match ? Number(match[1]) : null;
}

/** A paragraph style's heading level: from styles.xml, or from an id such as `Heading2`. */
export function headingLevel(
  styleId: string | null,
  styles: Map<string, StyleInfo>,
): number | null {
  if (!styleId) return null;
  const known = styles.get(styleId);
  if (known) return known.heading;
  return headingFromName(styleId.toLowerCase());
}
