import { combineReads, questionNumberKey, sameOpening } from "./merge";
import {
  mergeSource,
  type ChunkRef,
  type ChunkSegment,
  type SegmentAnswer,
  type SegmentQuestion,
} from "./segment";
import { normalizePassage } from "./sourceText";

/**
 * Reading a chunk in halves (#590). A chunk dense with short questions can need more room for its
 * segment answer than one call has, and the answer is then cut off and useless. `segmentChunk`
 * reads such a chunk again as two halves and joins what they found into the one `ChunkSegment`
 * the chunk would have given, so nothing after the segment pass knows it was split. Pure.
 */

/** A numbered question, "Question 4", or a heading: where a cut is least likely to split one. */
const QUESTION_START = /^(?:#{1,6}[ \t]+\S|(?:\*\*|__)?(?:question[ \t]+)?\d{1,3}[.):][ \t])/i;

/** A cut this far from either end leaves each half a real share of the text. */
const NEAREST_END = 0.25;

/** Where each match of `separator` ends, which is where the text after it starts; never an end. */
function startsAfter(text: string, separator: RegExp): number[] {
  return [...text.matchAll(separator)]
    .map((match) => match.index + match[0].length)
    .filter((at) => at > 0 && at < text.length);
}

function nearest(starts: readonly number[], middle: number): number | null {
  if (starts.length === 0) return null;
  return starts.reduce((best, at) => (Math.abs(at - middle) < Math.abs(best - middle) ? at : best));
}

/**
 * Cuts `text` in two near its middle: before a question's start if there is one, else at a blank
 * line, else at a line, else at a space. Null for text with nowhere to cut.
 */
export function splitText(text: string): [string, string] | null {
  const blocks = startsAfter(text, /\n[ \t]*\n\s*/g);
  const tiers = [
    blocks.filter((at) => QUESTION_START.test(text.slice(at, at + 40))),
    blocks,
    startsAfter(text, /\n+/g),
    startsAfter(text, /[ \t]+/g),
  ];
  const middle = text.length / 2;
  const inBand = (at: number) =>
    at >= text.length * NEAREST_END && at <= text.length * (1 - NEAREST_END);
  const cut =
    tiers.map((tier) => nearest(tier.filter(inBand), middle)).find((at) => at !== null) ??
    nearest(tiers.flat(), middle);
  if (cut === null || cut === undefined) return null;
  const first = text.slice(0, cut).trimEnd();
  const second = text.slice(cut);
  return first === "" || second.trim() === "" ? null : [first, second];
}

/**
 * Halves pages `from` to `to` (inclusive) around a page both halves hold, as chunks overlap, so a
 * question that crosses the cut is whole in one of them. Two pages are one each; one page cannot
 * be split.
 */
export function splitPages(from: number, to: number): [[number, number], [number, number]] | null {
  if (to <= from) return null;
  if (to === from + 1) {
    return [
      [from, from],
      [to, to],
    ];
  }
  const middle = Math.floor((from + to) / 2);
  return [
    [from, middle],
    [middle, to],
  ];
}

const answerIdentity = (answer: SegmentAnswer): string =>
  [
    questionNumberKey(answer.number),
    answer.caseStudy === null ? "" : normalizePassage(answer.caseStudy),
    answer.kind,
    normalizePassage(answer.text),
  ].join("|");

/**
 * The questions of part `b` added to those read before it, the last of them from part `a`.
 *
 * - A question the cut ran through (`a` ends cut off, `b` opens continued) is one question, with
 *   its first opening.
 * - Two PDF halves hold one page in common. A question that starts on it is in both, and is kept
 *   once: every question of `b` on that page is looked for among `a`'s on it.
 *
 * Text halves hold nothing in common, so nothing else is taken for a repeat: two questions either
 * side of the cut that open with the same words ("A nurse is caring for a client who has...") are
 * two questions.
 */
function addPart(
  kept: readonly SegmentQuestion[],
  a: ChunkSegment,
  b: ChunkSegment,
): SegmentQuestion[] {
  const result = [...kept];
  const shared = a.pageTo !== null && a.pageTo === b.pageFrom ? a.pageTo : null;
  const fromA = (question: SegmentQuestion) => a.questions.includes(question);
  b.questions.forEach((question, place) => {
    const last = result.at(-1);
    if (place === 0 && last && last === a.questions.at(-1) && last.cutOff && question.continued) {
      result[result.length - 1] = {
        ...combineReads(last, question, last),
        cutOff: question.cutOff,
        continued: last.continued,
      };
      return;
    }
    if (shared !== null && question.page === shared && !question.continued) {
      const twin = result.findIndex(
        (earlier) => fromA(earlier) && earlier.page === shared && sameOpening(earlier, question),
      );
      if (twin >= 0) {
        const earlier = result[twin];
        // The later read saw more of it when the earlier one was cut off.
        const keep = earlier.cutOff && !question.cutOff ? question : earlier;
        result[twin] = {
          ...combineReads(earlier, question, keep),
          cutOff: keep.cutOff,
          continued: earlier.continued,
        };
        return;
      }
    }
    result.push(question);
  });
  return result;
}

/**
 * The parts of one chunk, in order, as the chunk's own segment (see `addPart` for what is joined).
 * Answer sections are kept once each; which question each belongs to is still decided over the
 * whole file, later.
 */
export function joinParts(whole: ChunkRef, parts: readonly ChunkSegment[]): ChunkSegment {
  let joined: SegmentQuestion[] = [];
  parts.forEach((part, place) => {
    joined = place === 0 ? [...part.questions] : addPart(joined, parts[place - 1], part);
  });
  const questions = joined.map((question, index) => ({
    ...question,
    chunk: whole.position,
    index,
  }));

  const seen = new Set<string>();
  const answers = parts
    .flatMap((part) => part.answers)
    .filter((answer) => {
      const identity = answerIdentity(answer);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .map((answer) => ({ ...answer, chunk: whole.position }));

  return {
    position: whole.position,
    pageFrom: whole.pageFrom,
    pageTo: whole.pageTo,
    questions,
    answers,
    droppedAnswers: parts.reduce((sum, part) => sum + part.droppedAnswers, 0),
    source: mergeSource(parts),
  };
}
