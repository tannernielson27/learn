import { choiceMarks } from "./choiceMarks";
import { hasStruck, markupSpans, openingKey, withoutStruck } from "./sourceText";

/**
 * Whether a text source shows any answer for a question (#343, ADR 0008 "Extract only").
 *
 * A draft that comes back keyed is only believed when the part of the source the question sits
 * in shows something a key could have been copied from: a check mark, a lone `*`, a highlight, a
 * shaded cell or option, an `X` cell, an "Answer:" or "Key:" line, or an answer section printed
 * elsewhere. Since #592 an option, list item or table cell set apart only by bold, underline or
 * font colour counts too (`choiceMarks.ts`), as weaker evidence: the key is believed and the
 * teacher is asked to check it. When the source shows none of these, the model wrote the key
 * itself, and the draft is not converted.
 *
 * It is a net, not a proof: italics (`*word*`) and a stem that says "correct:" count as marks,
 * and so does a chart value printed in red, so a key invented beside them passes here and is
 * left to the reviewer, as every key is. A PDF has no text here at all; its keys are marked for
 * the reviewer instead (`check_key`).
 */

interface Normalized {
  text: string;
  /** For each character of `text`, the index in the source it came from. */
  map: number[];
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * `normalizePassage`, keeping where each character came from. The converter's lettered markup is
 * stepped over as `normalizePassage` takes it out, and with `skipStruck` so is struck-out text.
 */
function normalizeWithMap(source: string, skipStruck = false): Normalized {
  const spans = markupSpans(source, skipStruck);
  let nextSpan = 0;
  let text = "";
  const map: number[] = [];
  let space = true;
  const separate = (at: number) => {
    if (space) return;
    text += " ";
    map.push(at);
    space = true;
  };
  for (let i = 0; i < source.length; i += 1) {
    while (nextSpan < spans.length && spans[nextSpan][1] <= i) nextSpan += 1;
    if (nextSpan < spans.length && spans[nextSpan][0] <= i) {
      separate(i);
      i = spans[nextSpan][1] - 1;
      continue;
    }
    let char = source[i];
    if (char === "\\" && i + 1 < source.length) {
      i += 1;
      char = source[i];
    }
    // 10^3 is 10³: a caret between two characters joins them, as `normalizePassage` has it.
    if (char === "^" && !space && WORD_CHAR.test(source[i + 1] ?? "")) continue;
    const folded = char.normalize("NFKC").toLowerCase();
    for (const piece of folded) {
      if (WORD_CHAR.test(piece)) {
        text += piece;
        map.push(i);
        space = false;
      } else {
        separate(i);
      }
    }
  }
  return { text, map };
}

/**
 * Where each question starts in `source`, found by its opening words, searching on from the one
 * before; -1 for one that is not there. An opening that is not found as written is looked for
 * again with struck-out text left out of both, since the model may not have copied it.
 */
export function locateOpenings(source: string, excerpts: readonly string[]): number[] {
  const normalized = normalizeWithMap(source);
  const haystack = ` ${normalized.text} `;
  const skipping = hasStruck(source) ? normalizeWithMap(source, true) : null;
  let from = 0;
  return excerpts.map((excerpt) => {
    const wanted = openingKey(excerpt);
    if (!wanted) return -1;
    // In order first; a question listed out of the document's order is looked for anywhere.
    let at = haystack.indexOf(` ${wanted} `, from);
    if (at < 0) at = haystack.indexOf(` ${wanted} `);
    if (at >= 0) {
      from = at + 1;
      // `at` points at the space before the match in `haystack`, which is one longer at the front.
      return normalized.map[at] ?? -1;
    }
    if (skipping === null) return -1;
    const unstruck = openingKey(withoutStruck(excerpt));
    const again = unstruck ? ` ${skipping.text} `.indexOf(` ${unstruck} `) : -1;
    return again < 0 ? -1 : (skipping.map[again] ?? -1);
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
    const later = starts.filter((other, at) => at !== index && other > start);
    return source.slice(start, later.length > 0 ? Math.min(...later) : source.length);
  });
}

const CHECK_MARKS = /[✅✔✓☑]/u;
/**
 * `==text=={yellow}` is how a .docx's highlight arrives, and `=={#FFFF00}` its run shading. A
 * stretch that is only coloured, `=={color #C00000}`, is not a highlight: it counts where it
 * sets a choice apart (`choiceMarks`), not anywhere.
 */
const DOCX_HIGHLIGHT = /==(?:(?!==)[^\n])+==\{(?!color\b)/i;
const KEY_LINE = /\b(?:answers?|keys?|correct(?:\s+(?:answers?|order|responses?))?)\s*[:：]/i;
const X_CELL = /\|\s*[xX]\s*(?=\|)/;
const BULLET = /^\s*[*+-]\s+/;

/** A `*` that is not half of `**` bold, on a line with its list bullet taken off. */
function hasLoneStar(region: string): boolean {
  return region.split("\n").some((line) => /(?:^|[^*])\*(?:[^*]|$)/.test(line.replace(BULLET, "")));
}

/**
 * How strongly `region` shows a key:
 *
 * - `marked`: a mark made to say "this is the answer": a check mark, a lone `*`, a highlight,
 *   shading that sets one choice apart, an `X` cell, an "Answer:" line.
 * - `formatting`: only bold, underline or font colour sets a choice apart. An author may mean it
 *   as the key, or as emphasis, so the teacher is asked to check.
 * - `none`: nothing a key could have been copied from.
 */
export type KeyEvidence = "marked" | "formatting" | "none";

export function keyEvidence(region: string): KeyEvidence {
  if (
    CHECK_MARKS.test(region) ||
    DOCX_HIGHLIGHT.test(region) ||
    KEY_LINE.test(region) ||
    X_CELL.test(region) ||
    hasLoneStar(region)
  ) {
    return "marked";
  }
  const marks = choiceMarks(region);
  if (marks.shading) return "marked";
  return marks.emphasis ? "formatting" : "none";
}

/** Whether `region` shows anything a key could have been copied from. */
export const showsKey = (region: string): boolean => keyEvidence(region) !== "none";
