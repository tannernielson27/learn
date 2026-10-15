import type { ChunkSegment, SegmentAnswer, SegmentQuestion } from "./segment";
import { normalizePassage, openingKey } from "./sourceText";

/**
 * One file's chunks, merged (#342, ADR 0008 Pipeline step 4). Pure.
 *
 * 1. **Overlap duplicates.** PDF chunks share a page. A question that starts on the shared page is
 *    reported by both chunks; it is kept once, from the chunk that saw it whole.
 * 2. **Split questions.** A question cut off at the end of one chunk (`cutOff`) and continued at the
 *    start of the next (`continued`) is joined into one, which keeps the first chunk's opening.
 * 3. **Answers printed elsewhere** attach to the question with the same number (and case study,
 *    when the answer names one), wherever in the file either is. An answer that matches no
 *    question, or more than one, is left unlinked for the reviewer, never guessed.
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

const sameOpening = (a: SegmentQuestion, b: SegmentQuestion) =>
  openingKey(a.excerpt, DEDUP_WORDS) === openingKey(b.excerpt, DEDUP_WORDS);

/** The page two neighbouring PDF chunks share, if they share one. */
function sharedPage(a: ChunkSegment, b: ChunkSegment): number | null {
  if (a.pageTo === null || b.pageFrom === null) return null;
  return a.pageTo === b.pageFrom ? a.pageTo : null;
}

/**
 * Whether `later` (from chunk b) is `earlier` (from chunk a) read twice. For PDFs both must start on
 * the shared page. Text chunks do not overlap, but a model may still repeat the last question of
 * one chunk at the start of the next; only that boundary pair is compared.
 */
function isOverlapDuplicate(
  earlier: Working,
  later: Working,
  a: ChunkSegment,
  b: ChunkSegment,
): boolean {
  if (later.continued || !sameOpening(earlier, later)) return false;
  const page = sharedPage(a, b);
  if (page !== null) return earlier.page === page && later.page === page;
  const lastOfA = a.questions.at(-1);
  const firstOfB = b.questions[0];
  return (
    a.pageTo === null &&
    lastOfA?.index === earlier.index &&
    lastOfA.chunk === earlier.chunks.at(-1) &&
    firstOfB?.index === later.index
  );
}

/** The type of whichever read was surer of one; with neither typed, the question has no NGN type. */
function typing(
  first: Working,
  second: Working,
): Pick<Working, "type" | "confidence"> & {
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

function combine(first: Working, second: Working, keepOpeningOf: Working): Working {
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
    },
    chunks: [...new Set([...first.chunks, ...second.chunks])].sort((x, y) => x - y),
    answers: [],
  };
}

const working = (question: SegmentQuestion): Working => ({
  ...question,
  chunks: [question.chunk],
  answers: [],
});

/** Folds chunk `b`'s questions onto what came before it. */
function foldChunk(merged: Working[], a: ChunkSegment | undefined, b: ChunkSegment): Working[] {
  const result = [...merged];
  for (const question of b.questions.map(working)) {
    const previous = result.at(-1);
    // Only neighbours are compared: with a chunk missing between them, nothing is joined.
    const fromPrevious =
      a !== undefined && a.position === b.position - 1 && previous?.chunks.at(-1) === a.position;
    if (previous && fromPrevious && isOverlapDuplicate(previous, question, a, b)) {
      // The later read saw more of it when the earlier one was cut off.
      const keep = previous.cutOff && !question.cutOff ? question : previous;
      result[result.length - 1] = {
        ...combine(previous, question, keep),
        index: previous.index,
        chunk: previous.chunk,
        cutOff: keep.cutOff,
        continued: previous.continued,
      };
      continue;
    }
    if (previous && fromPrevious && previous.cutOff && question.continued) {
      result[result.length - 1] = {
        ...combine(previous, question, previous),
        cutOff: question.cutOff,
        continued: previous.continued,
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
