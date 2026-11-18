import type { ChunkSegment, SegmentAnswer, SegmentQuestion } from "./segment";
import { normalizePassage, openingKey } from "./sourceText";

/**
 * One file's chunks, merged (#342, ADR 0008 Pipeline step 4). Pure.
 *
 * 1. **Overlap duplicates.** PDF chunks share a page. A question that starts on the shared page is
 *    reported by both chunks; it is kept once, from the chunk that saw it whole. Every question
 *    of the later chunk on that page is looked for among the earlier chunk's on it (#592; the
 *    rule `segmentSplit.ts` has for the halves of one chunk). Text chunks share nothing, so no
 *    two questions of a text file are ever taken for one read twice: "A nurse is caring for a
 *    client who has..." opens many questions.
 * 2. **Split questions.** A question cut off at the end of one chunk (`cutOff`) and continued at the
 *    start of the next (`continued`) is joined into one, which keeps the first chunk's opening.
 * 3. **Answers printed elsewhere** attach to the question with the same number (and case study,
 *    when the answer names one), wherever in the file either is. An answer that matches no
 *    question, or more than one, is left unlinked, never guessed: `finish.ts` counts them for
 *    the review page.
 */

export interface MergedQuestion extends SegmentQuestion {
  /** Order in the file, from 0. */
  position: number;
  /** The chunks the question was read from. */
  chunks: number[];
  answers: SegmentAnswer[];
}

export interface MergedSegments {
  questions: MergedQuestion[];
  /** Answer sections that matched no question, or more than one. */
  unlinkedAnswers: SegmentAnswer[];
}

const DEDUP_WORDS = 8;

type Working = Omit<MergedQuestion, "position">;

/** Whether two reads open with the same words: the test for one question read twice. */
export const sameOpening = (a: SegmentQuestion, b: SegmentQuestion) =>
  openingKey(a.excerpt, DEDUP_WORDS) === openingKey(b.excerpt, DEDUP_WORDS);

/** The page two neighbouring PDF chunks share, if they share one. */
function sharedPage(a: ChunkSegment, b: ChunkSegment): number | null {
  if (a.pageTo === null || b.pageFrom === null) return null;
  return a.pageTo === b.pageFrom ? a.pageTo : null;
}

/** The type of whichever read was surer of one; with neither typed, the question has no NGN type. */
function typing(
  first: SegmentQuestion,
  second: SegmentQuestion,
): Pick<SegmentQuestion, "type" | "confidence"> & {
  notNgn: string | null;
} {
  const typed = [first, second].filter((read) => read.type !== null);
  if (typed.length === 0) {
    return {
      type: null,
      confidence: Math.min(first.confidence, second.confidence),
      notNgn: first.flags.notNgn || second.flags.notNgn || "",
    };
  }
  const surest = typed.reduce((best, read) => (read.confidence > best.confidence ? read : best));
  return { type: surest.type, confidence: surest.confidence, notNgn: null };
}

/**
 * Two reads of one question as one, with the opening of `keepOpeningOf` (one of the two). Also
 * how the halves of a chunk read in two are joined (#590, `segmentSplit.ts`).
 */
export function combineReads<T extends SegmentQuestion>(first: T, second: T, keepOpeningOf: T): T {
  const { type, confidence, notNgn } = typing(first, second);
  return {
    ...keepOpeningOf,
    type,
    confidence,
    number: keepOpeningOf.number ?? first.number ?? second.number,
    page: first.page ?? second.page,
    group: keepOpeningOf.group ?? first.group ?? second.group,
    scoringRule: first.scoringRule ?? second.scoringRule,
    flags: {
      instructorNote: first.flags.instructorNote || second.flags.instructorNote,
      reliesOnImage: first.flags.reliesOnImage || second.flags.reliesOnImage,
      notNgn,
      notInSource: keepOpeningOf.flags.notInSource,
      ownChart: first.flags.ownChart || second.flags.ownChart,
    },
  };
}

function combine(first: Working, second: Working, keepOpeningOf: Working): Working {
  return {
    ...combineReads(first, second, keepOpeningOf),
    chunks: [...new Set([...first.chunks, ...second.chunks])].sort((x, y) => x - y),
    answers: [],
  };
}

const working = (question: SegmentQuestion): Working => ({
  ...question,
  chunks: [question.chunk],
  answers: [],
});

/**
 * Folds chunk `b`'s questions onto what came before it. Only neighbours are compared: with a
 * chunk missing between them, nothing is joined.
 */
function foldChunk(merged: Working[], a: ChunkSegment | undefined, b: ChunkSegment): Working[] {
  const result = [...merged];
  const neighbour = a !== undefined && a.position === b.position - 1 ? a : null;
  const shared = neighbour ? sharedPage(neighbour, b) : null;
  // Read from `a` and not yet joined to anything of `b`.
  const onlyFromA = (question: Working) => question.chunks.at(-1) === neighbour?.position;
  for (const question of b.questions.map(working)) {
    const previous = result.at(-1);
    if (previous && onlyFromA(previous) && previous.cutOff && question.continued) {
      result[result.length - 1] = {
        ...combine(previous, question, previous),
        cutOff: question.cutOff,
        continued: previous.continued,
      };
      continue;
    }
    const twin =
      shared !== null && question.page === shared && !question.continued
        ? result.findIndex(
            (earlier) =>
              onlyFromA(earlier) && earlier.page === shared && sameOpening(earlier, question),
          )
        : -1;
    if (twin >= 0) {
      const earlier = result[twin];
      // The later read saw more of it when the earlier one was cut off.
      const keep = earlier.cutOff && !question.cutOff ? question : earlier;
      result[twin] = {
        ...combine(earlier, question, keep),
        index: earlier.index,
        chunk: earlier.chunk,
        cutOff: keep.cutOff,
        continued: earlier.continued,
      };
      continue;
    }
    result.push(question);
  }
  return result;
}

/** "Question 4", "4." and "4" are one number; "3a" keeps its letter. */
export function questionNumberKey(number: string | null): string | null {
  if (number === null) return null;
  const match = /(\d+)\s*([a-z])?\b/i.exec(number);
  if (!match) return normalizePassage(number) || null;
  return `${Number(match[1])}${match[2]?.toLowerCase() ?? ""}`;
}

function attachAnswers(
  questions: MergedQuestion[],
  answers: SegmentAnswer[],
): { questions: MergedQuestion[]; unlinked: SegmentAnswer[] } {
  const attached = new Map<number, SegmentAnswer[]>();
  const unlinked: SegmentAnswer[] = [];
  const seen = new Set<string>();
  for (const answer of answers) {
    const key = questionNumberKey(answer.number);
    const group = answer.caseStudy === null ? null : normalizePassage(answer.caseStudy);
    // The same section read twice, on a shared page.
    const identity = `${key}|${group}|${answer.kind}|${normalizePassage(answer.text)}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const candidates = questions.filter(
      (question) =>
        questionNumberKey(question.number) === key &&
        (group === null ||
          (question.group !== null && normalizePassage(question.group.title) === group)),
    );
    if (key === null || candidates.length !== 1) {
      unlinked.push(answer);
      continue;
    }
    const position = candidates[0].position;
    attached.set(position, [...(attached.get(position) ?? []), answer]);
  }
  return {
    questions: questions.map((question) => ({
      ...question,
      answers: attached.get(question.position) ?? [],
    })),
    unlinked,
  };
}

export function mergeSegments(chunks: readonly ChunkSegment[]): MergedSegments {
  const ordered = [...chunks].sort((a, b) => a.position - b.position);
  let merged: Working[] = [];
  ordered.forEach((chunk, i) => {
    merged = foldChunk(merged, ordered[i - 1], chunk);
  });
  const positioned = merged.map((question, position) => ({ ...question, position }));
  const { questions, unlinked } = attachAnswers(
    positioned,
    ordered.flatMap((chunk) => chunk.answers),
  );
  return { questions, unlinkedAnswers: unlinked };
}
