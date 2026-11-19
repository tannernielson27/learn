import type { BankQuestion } from "./bank";

/**
 * What the generator writes for one corpus document (#594), in the formats `files.ts` (one folder
 * up) reads: the document itself, what it should import as, and the drafts a faithful model
 * returns for it.
 */
export interface CorpusDocument {
  name: string;
  bytes: Uint8Array;
  /** Null for a document whose expected file is converted once and checked by hand. */
  expected: ExpectedFile | null;
  recording: RecordingFile;
}

export interface ExpectedFile {
  document: string;
  covers: string[];
  questions: { label: string; status: "ready" | "needs_answer"; item: Record<string, unknown> }[];
  caseStudies: { label: string; caseStudy: Record<string, unknown> }[];
}

export interface RecordingFile {
  document: string;
  /** `generated`: written by this folder as a faithful model answers, not by a live run. */
  source: "generated";
  questions: { opening: string; type: string; draft: Record<string, unknown> }[];
  caseStudies: { draft: Record<string, unknown> }[];
}

/** The ids the converter gives options: `opt_a` for the first. */
const optionId = (place: number): string => `opt_${String.fromCharCode(97 + place)}`;

/** A question's opening as the segment pass copies it: about its first thirty words. */
/**
 * A stem without the table printed above its question (#605): what the document says of the
 * question itself, and so what a model listing questions quotes and a search of its text finds.
 */
export const questionText = (stem: string): string =>
  stem
    .split(/\n{2,}/)
    .filter((paragraph) => !paragraph.trimStart().startsWith("|"))
    .join("\n\n");

export const openingOf = (stem: string): string =>
  questionText(stem).split(/\s+/).slice(0, 30).join(" ");

/**
 * The learn.v1 item a printed question should import as, written out here and not made with the
 * product's converter, so the scorer checks the converter against something it did not write.
 * `keyed: false` is a question the document leaves unmarked: its key stays empty.
 */
export function expectedQuestion(
  id: string,
  label: string,
  question: BankQuestion,
  keyed = true,
): ExpectedFile["questions"][number] {
  const options = question.options.map((text, place) => ({ id: optionId(place), label: text }));
  const correct = keyed ? question.correct.map(optionId) : [];
  const envelope = { id, stem: { kind: "markdown", value: question.stem }, rationale: {} };
  const item = question.selectAll
    ? {
        ...envelope,
        type: "multiple_response",
        content: { variant: "sata", options },
        answerKey: { correctOptionIds: correct },
        scoring: { model: "plus_minus", maxPoints: Math.max(1, correct.length) },
      }
    : {
        ...envelope,
        type: "multiple_choice",
        content: { options },
        answerKey: { correctOptionId: correct[0] ?? "" },
        scoring: { model: "zero_one", maxPoints: 1 },
      };
  return { label, status: keyed ? "ready" : "needs_answer", item };
}

/**
 * The draft a faithful model returns for a printed question. The key is copied the way the
 * document shows it: `answer` is a key printed apart from the options ("Answer: B", or a line of
 * the answer key at the back), and `starred` puts the document's own mark on the right options
 * (a `*`, which is also how a bold or coloured option is carried: `DOCX_MARKUP`). With neither,
 * the draft has no key, as the document has none.
 */
export function recordedQuestion(
  question: BankQuestion,
  key: { answer?: string; starred?: boolean } = {},
): RecordingFile["questions"][number] {
  const type = question.selectAll ? "multiple_response" : "multiple_choice";
  return {
    opening: openingOf(question.stem),
    type,
    draft: {
      type,
      stem: question.stem,
      options: question.options.map((text, place) => ({
        text: key.starred && question.correct.includes(place) ? `${text} *` : text,
      })),
      ...(key.answer !== undefined ? { answer: key.answer } : {}),
    },
  };
}
