import { CASE_STUDY_STEP_COUNT } from "@/lib/ngn/schemas";
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
 * 4. **A case study step that opens the next part.** Each chunk is read on its own, so a chunk
 *    that opens with a case study's last step can miss the title printed above it and report a
 *    standalone question (corpus document 11 on prod, 2026-11-20: five steps, record dropped). An
 *    untitled question that opens the next chunk joins the case study the previous chunk ended
 *    with, while that case study is short of its six steps and the document says the question is
 *    the next step: its printed number is, or, with none printed, the step before says "of 6".
 *    Questions after it in its chunk join on the same terms, up to six.
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

/** One case study, however its title is spaced or capitalised: how its steps are grouped. */
export const caseStudyKey = (title: string): string =>
  title.trim().toLowerCase().replace(/\s+/g, " ");

const numeric = (key: string | null): number | null =>
  key !== null && /^\d+$/.test(key) ? Number(key) : null;

/** "Question 5 of 6": a step that says the case study has six. */
const SAYS_SIX = new RegExp(`\\bof\\s+${CASE_STUDY_STEP_COUNT}\\b`, "i");

/**
 * Whether the document says `question` is the step after `previous`. A printed number must be the
 * next step ("Question 6 of 6" after step 5) or the next in the steps' own numbering ("18." after
 * "17."). With no number printed, a step of the case study must say how many there are
 * ("Question 5 of 6"): a quiz that numbers nothing gives no reason to take a standalone question
 * for a step.
 */
function saysNextStep(previous: Working, question: Working, known: CaseSoFar): boolean {
  const key = questionNumberKey(question.number);
  if (key === null) return known.members.some((member) => SAYS_SIX.test(member.number ?? ""));
  const before = numeric(questionNumberKey(previous.number));
  return (
    (known.lastStep !== null && key === String(known.lastStep + 1)) ||
    (before !== null && key === String(before + 1))
  );
}

interface CaseSoFar {
  size: number;
  /** The highest step number printed, if any was. */
  lastStep: number | null;
  members: Working[];
}

function casesOf(merged: readonly Working[]): Map<string, CaseSoFar> {
  const cases = new Map<string, CaseSoFar>();
  for (const question of merged) {
    if (question.group === null) continue;
    const key = caseStudyKey(question.group.title);
    const known = cases.get(key) ?? { size: 0, lastStep: null, members: [] };
    const step = question.group.step;
    cases.set(key, {
      size: known.size + 1,
      lastStep: step === null ? known.lastStep : Math.max(step, known.lastStep ?? 0),
      members: [...known.members, question],
    });
  }
  return cases;
}

/**
 * Whether `question` may be taken for a step of the case study `previous` belongs to, apart from
 * where it sits. A part that opens partway through a question is the split-question rule's; a
 * question with no NGN type is no step; a second read of a step already there (a shared PDF page
 * whose openings differed past `sameOpening`'s words) is not a new one.
 */
function canJoin(previous: Working, question: Working, known: CaseSoFar): boolean {
  return (
    question.group === null &&
    question.type !== null &&
    !question.continued &&
    !previous.cutOff &&
    known.size < CASE_STUDY_STEP_COUNT &&
    !known.members.some((member) => sameOpening(member, question)) &&
    saysNextStep(previous, question, known)
  );
}

/** Rule 4 of the file comment. */
function joinOpeningSteps(merged: readonly Working[]): Working[] {
  const cases = casesOf(merged);
  const result: Working[] = [];
  let joining: string | null = null;
  for (const question of merged) {
    const previous = result.at(-1);
    const group = previous?.group ?? null;
    const key = group === null ? null : caseStudyKey(group.title);
    const known = key === null ? undefined : cases.get(key);
    const last = previous?.chunks.at(-1);
    const opensPart = last !== undefined && question.chunks[0] === last + 1;
    const inRun = joining !== null && joining === key && question.chunks[0] === last;
    if (
      previous === undefined ||
      group === null ||
      key === null ||
      known === undefined ||
      !(opensPart || inRun) ||
      !canJoin(previous, question, known)
    ) {
      joining = null;
      result.push(question);
      continue;
    }
    const step =
      known.lastStep === null || known.lastStep >= CASE_STUDY_STEP_COUNT
        ? null
        : known.lastStep + 1;
    joining = key;
    // A case study step's chart is the case study's, never its own.
    const joined: Working = {
      ...question,
      group: { title: group.title, step },
      flags: { ...question.flags, ownChart: false },
    };
    cases.set(key, {
      size: known.size + 1,
      lastStep: step ?? known.lastStep,
      members: [...known.members, joined],
    });
    result.push(joined);
  }
  return result;
}

export function mergeSegments(chunks: readonly ChunkSegment[]): MergedSegments {
  const ordered = [...chunks].sort((a, b) => a.position - b.position);
  let folded: Working[] = [];
  ordered.forEach((chunk, i) => {
    folded = foldChunk(folded, ordered[i - 1], chunk);
  });
  const merged = joinOpeningSteps(folded);
  const positioned = merged.map((question, position) => ({ ...question, position }));
  const { questions, unlinked } = attachAnswers(
    positioned,
    ordered.flatMap((chunk) => chunk.answers),
  );
  return { questions, unlinkedAnswers: unlinked };
}
