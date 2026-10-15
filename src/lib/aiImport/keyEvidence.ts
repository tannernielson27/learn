import { openingKey } from "./sourceText";

/**
 * Whether a text source shows any answer for a question (#343, ADR 0008 "Extract only").
 *
 * A draft that comes back keyed is only believed when the part of the source the question sits
 * in shows something a key could have been copied from: a check mark, a lone `*`, a highlight, a
 * shaded cell, an `X` cell, an "Answer:" or "Key:" line, or an answer section printed elsewhere.
 * When it shows none of these, the model wrote the key itself, and the draft is not converted.
 *
 * It is a net, not a proof: italics (`*word*`) and a stem that says "correct:" count as marks, so
 * a key invented beside them passes here and is left to the reviewer, as every key is. A PDF has
 * no text here at all; its keys are marked for the reviewer instead (`check_key`).
 */

interface Normalized {
  text: string;
  /** For each character of `text`, the index in the source it came from. */
  map: number[];
}

/** `normalizePassage`, keeping where each character came from. */
function normalizeWithMap(source: string): Normalized {
  let text = "";
  const map: number[] = [];
  let space = true;
  for (let i = 0; i < source.length; i += 1) {
    let char = source[i];
    if (char === "\\" && i + 1 < source.length) {
      i += 1;
      char = source[i];
    }
    const folded = char.normalize("NFKC").toLowerCase();
    for (const piece of folded) {
      if (/[\p{L}\p{N}]/u.test(piece)) {
        text += piece;
        map.push(i);
        space = false;
      } else if (!space) {
        text += " ";
        map.push(i);
        space = true;
      }
    }
  }
  return { text, map };
}

/**
 * Where each question starts in `source`, found by its opening words, searching on from the one
 * before; -1 for one that is not there.
 */
export function locateOpenings(source: string, excerpts: readonly string[]): number[] {
  const normalized = normalizeWithMap(source);
  const haystack = ` ${normalized.text} `;
  let from = 0;
  return excerpts.map((excerpt) => {
    const wanted = openingKey(excerpt);
    if (!wanted) return -1;
    const at = haystack.indexOf(` ${wanted} `, from);
    if (at < 0) return -1;
    from = at + 1;
    // `at` points at the space before the match in `haystack`, which is one longer at the front.
    return normalized.map[at] ?? -1;
  });
}

/**
 * The part of `source` each question sits in: from its opening to the next question's, or to the
 * end. Null for a question that could not be found.
 */
export function questionRegions(source: string, excerpts: readonly string[]): (string | null)[] {
  const starts = locateOpenings(source, excerpts);
  return starts.map((start, index) => {
    if (start < 0) return null;
    const next = starts.slice(index + 1).find((later) => later > start);
    return source.slice(start, next ?? source.length);
  });
}

const CHECK_MARKS = /[✅✔✓☑]/u;
/** `==text=={colour}` and `{shaded #RRGGBB}` are how a .docx's highlight and shading arrive. */
const DOCX_COLOUR = /==[^=\n]+==\{|\{shaded\s/i;
const KEY_LINE = /\b(?:answers?|keys?|correct(?:\s+(?:answers?|order|responses?))?)\s*[:：]/i;
const X_CELL = /\|\s*[xX]\s*(?=\|)/;
const BULLET = /^\s*[*+-]\s+/;

/** A `*` that is not half of `**` bold, on a line with its list bullet taken off. */
function hasLoneStar(region: string): boolean {
  return region.split("\n").some((line) => /(?:^|[^*])\*(?:[^*]|$)/.test(line.replace(BULLET, "")));
}

/** Whether `region` shows anything a key could have been copied from. */
export function showsKey(region: string): boolean {
  return (
    CHECK_MARKS.test(region) ||
    DOCX_COLOUR.test(region) ||
    KEY_LINE.test(region) ||
    X_CELL.test(region) ||
    hasLoneStar(region)
  );
}
