/**
 * Search highlights. The database marks each matched word between U+0002 and U+0003 (it removes
 * those characters from the item text first), and the app splits the text on them into segments.
 * Segments render as React text and `<mark>` elements, so item text is always escaped and never
 * read as HTML.
 */
export const MARK_START = "\u0002";
export const MARK_END = "\u0003";

export interface Segment {
  text: string;
  match: boolean;
}

function pushSegment(segments: Segment[], text: string, match: boolean): void {
  if (text === "") return;
  const last = segments.at(-1);
  if (last && last.match === match) {
    segments[segments.length - 1] = { text: last.text + text, match };
  } else {
    segments.push({ text, match });
  }
}

/** Splits marked text into segments. A start with no end marks the rest; a stray end is dropped. */
export function splitHighlight(marked: string): Segment[] {
  const segments: Segment[] = [];
  let match = false;
  let current = "";
  for (const char of marked) {
    if (char === MARK_START || char === MARK_END) {
      pushSegment(segments, current, match);
      current = "";
      match = char === MARK_START;
    } else {
      current += char;
    }
  }
  pushSegment(segments, current, match);
  return segments;
}

export function hasMatch(segments: readonly Segment[]): boolean {
  return segments.some((segment) => segment.match);
}

const MARKDOWN = /[*_`#>[\]()!]/g;
/** How many characters of lead-in an excerpt keeps before a match it had to scroll to. */
const LEAD_IN = 30;

interface Char {
  char: string;
  match: boolean;
}

function regroup(chars: readonly Char[]): Segment[] {
  const segments: Segment[] = [];
  for (const { char, match } of chars) pushSegment(segments, char, match);
  return segments;
}

/**
 * Stem segments as a one-line excerpt of at most `max` characters: markdown marks dropped and
 * whitespace closed up, as the plain list shows a stem. When the first match would fall past the
 * end, the excerpt starts shortly before it instead, so a highlighted word is always shown.
 */
export function excerptSegments(segments: readonly Segment[], max = 140): Segment[] {
  const chars: Char[] = [];
  for (const segment of segments) {
    for (const char of segment.text.replace(MARKDOWN, "")) {
      const space = /\s/.test(char);
      // Whitespace closes up to one space, and none at the start.
      if (space && (chars.length === 0 || chars.at(-1)?.char === " ")) continue;
      chars.push({ char: space ? " " : char, match: segment.match });
    }
  }
  while (chars.at(-1)?.char === " ") chars.pop();
  if (chars.length <= max) return regroup(chars);

  const ellipsis: Char = { char: "…", match: false };
  const firstMatch = chars.findIndex((char) => char.match);
  const afterMatch = chars.findIndex((char, index) => index > firstMatch && !char.match);
  // Where the first match ends: nothing to keep in view without one.
  const matchEnd = firstMatch === -1 ? 0 : afterMatch === -1 ? chars.length : afterMatch;

  if (matchEnd <= max - 1) {
    return regroup([...trimEnd(chars.slice(0, max - 1)), ellipsis]);
  }
  // Start a little before the match, at a word boundary, and keep room for both ellipses.
  let start = Math.max(0, firstMatch - LEAD_IN);
  const boundary = chars.findIndex((char, index) => index >= start && char.char === " ");
  if (boundary !== -1 && boundary < firstMatch) start = boundary + 1;
  const end = start + max - 2;
  const body = chars.slice(start, end);
  return regroup([ellipsis, ...trimEnd(body), ...(end < chars.length ? [ellipsis] : [])]);
}

function trimEnd(chars: Char[]): Char[] {
  let end = chars.length;
  while (end > 0 && chars[end - 1]?.char === " ") end -= 1;
  return chars.slice(0, end);
}
