/**
 * Reading the formatting of one line of markdown (#592): which marks cover all of its words.
 * `choiceMarks.ts` decides what those marks mean; this file only reads them.
 */

export const BOLD = 1;
export const UNDERLINE = 2;
export const COLOUR = 4;
export const SHADE = 8;
/** Every mark, in the order they are looked at. */
export const MARKS = [BOLD, UNDERLINE, COLOUR, SHADE] as const;

/** `==text=={yellow}` or `=={color #C00000}`: a highlighted or coloured stretch of a .docx. */
const COLOURED = /==((?:(?!==)[^\n])+?)==\{([^{}\n]{1,40})\}/g;
const SHADED = /\{shaded\s+#[0-9A-Fa-f]{6}\}/gi;

/** A list item's label: `A.`, `b)`, `(3)`, `iv.`, or a bullet. */
const LABEL = /^(\(?(\d{1,3}|[A-Za-z]|[ivxl]{2,5}|[IVXL]{2,5})[.)]|[-•–+▪●○➢])\s+/;
const STAR_BULLET = /^\*\s+(?=\S)/;
/** An address: underlined and blue because it is a link, not because it is the answer. */
const LINK = /^(?:https?:\/\/|www\.)\S+$/i;

interface Marked {
  /** The characters a reader sees, markers taken out. */
  text: string;
  /** For each character of `text`, the marks on it. */
  marks: number[];
}

/** Which marks the text after a stretch's `==` carries: font colour, and nothing for a highlight. */
const stretchMarks = (tag: string): number =>
  tag.split(",").some((part) => /^color\b/i.test(part.trim())) ? COLOUR : 0;

/** Reads one line's markers into the marks on each character. An unclosed marker marks nothing. */
function readMarks(line: string): Marked {
  const stretch = new Array<number>(line.length).fill(0);
  const hidden = new Array<boolean>(line.length).fill(false);
  for (const match of line.matchAll(COLOURED)) {
    const open = match.index;
    const inner = open + 2;
    const close = inner + match[1].length;
    stretch.fill(stretchMarks(match[2]), inner, close);
    hidden.fill(true, open, inner);
    hidden.fill(true, close, open + match[0].length);
  }

  let text = "";
  const marks: number[] = [];
  let bold = false;
  let underline = false;
  let boldMarkers = 0;
  let underlineDepth = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (hidden[i]) continue;
    if (line.startsWith("**", i)) {
      bold = !bold;
      boldMarkers += 1;
      i += 1;
    } else if (line.startsWith("~~", i)) {
      i += 1;
    } else if (line.startsWith("<u>", i)) {
      underline = true;
      underlineDepth += 1;
      i += 2;
    } else if (line.startsWith("</u>", i)) {
      underline = false;
      underlineDepth -= 1;
      i += 3;
    } else if (line[i] !== "*") {
      // A lone `*` is an italic marker or a key's own star: neither is part of the words.
      // A backslash escapes the character after it (`\|` in a table cell).
      if (line[i] === "\\" && i + 1 < line.length) i += 1;
      text += line[i];
      marks.push((bold ? BOLD : 0) | (underline ? UNDERLINE : 0) | stretch[i]);
    }
  }
  // A marker left open belongs to a stretch that runs past this line, cut by the region's edge.
  const broken = (boldMarkers % 2 === 1 ? BOLD : 0) | (underlineDepth !== 0 ? UNDERLINE : 0);
  return broken === 0 ? { text, marks } : { text, marks: marks.map((mark) => mark & ~broken) };
}

/** The marks every visible character from `from` on carries; 0 when there is none. */
function sharedMarks(marked: Marked, from: number): number {
  let shared = BOLD | UNDERLINE | COLOUR;
  let seen = false;
  for (let i = from; i < marked.text.length; i += 1) {
    if (/\s/.test(marked.text[i])) continue;
    shared &= marked.marks[i];
    seen = true;
  }
  return seen ? shared : 0;
}

/** One list item, table cell or line of a cell, as its formatting reads. */
export interface MarkedLine {
  /** Which list it belongs to: its indent and the kind of its label; null with no label. */
  list: string | null;
  /** Its place in a lettered or numbered list (A and 1 are 1); null for a bullet or no label. */
  ordinal: number | null;
  /** Its words, after the label, with no markup. */
  text: string;
  /** The marks that cover every one of its words, shading included. */
  whole: number;
}

function labelKind(label: string): string {
  if (/\d/.test(label)) return "digit";
  if (/[a-z]/.test(label)) return "lower";
  return /[A-Z]/.test(label) ? "upper" : "bullet";
}

/** A single letter or a number as a place in a list; null for a roman numeral or a bullet. */
function ordinalOf(value: string | undefined): number | null {
  if (value === undefined) return null;
  if (/^\d+$/.test(value)) return Number(value);
  return value.length === 1 ? value.toLowerCase().charCodeAt(0) - 96 : null;
}

export function readLine(raw: string): MarkedLine {
  const indent = /^\s*/.exec(raw)?.[0].length ?? 0;
  const shaded = raw.search(SHADED) >= 0;
  let line = raw.replace(SHADED, " ").trim();
  let list: string | null = null;
  if (STAR_BULLET.test(line)) {
    line = line.replace(STAR_BULLET, "");
    list = `${indent}:bullet`;
  }
  const marked = readMarks(line);
  const label = list === null ? LABEL.exec(marked.text) : null;
  if (label) list = `${indent}:${labelKind(label[1])}`;
  const text = marked.text.slice(label ? label[0].length : 0).trim();
  const words = text === "" ? 0 : sharedMarks(marked, label ? label[0].length : 0);
  // A link is underlined and coloured whatever it means.
  const emphasis = LINK.test(text) ? words & ~(UNDERLINE | COLOUR) : words;
  return {
    list,
    ordinal: ordinalOf(label?.[2]),
    text,
    whole: emphasis | (shaded ? SHADE : 0),
  };
}
