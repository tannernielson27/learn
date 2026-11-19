import { para, run } from "@/lib/aiImport/files/testing/fixtures";
import {
  TOPICS,
  firstActionQuestion,
  keyLetters,
  letter,
  reportAllQuestion,
  reportQuestion,
  teachingQuestion,
  type BankQuestion,
} from "./bank";
import {
  NOTICE,
  PDF_LINE_GAP,
  PDF_PAGE_ROOM,
  wrap,
  writeDocx,
  writePdf,
  type PdfLine,
} from "./files";
import { expectedQuestion, recordedQuestion, type CorpusDocument } from "./shared";

/**
 * The three documents made from the question bank (#594): a 60-question Word test bank with an
 * "Answer:" line under each question, the same bank as a text PDF, and a 120-question markdown
 * bank with its key at the back.
 */

export const SIXTY_DOCX = "08-sixty-question-bank.docx";
export const LONG_BANK_MD = "09-long-bank-answers-at-the-back.md";
export const SIXTY_PDF = "12-sixty-question-bank.pdf";

const SIXTY_TITLE = "Adult Health Test Bank: 60 Questions";
const LONG_TITLE = "Adult Health Question Bank: 120 Questions";

/**
 * Sixty short questions, every one opening "A nurse is caring for a client who has": the shape
 * of the test bank that overflowed the segment pass (#590).
 */
export function sixtyQuestions(): BankQuestion[] {
  return TOPICS.slice(0, 30).flatMap((topic, index) => [
    reportQuestion(topic, index, false),
    firstActionQuestion(topic, index),
  ]);
}

/**
 * A hundred and twenty: for each topic a finding to report (select all that apply where the
 * topic has three) and a first action, then the teaching questions. The stems are longer than
 * the sixty's, so the document runs to three chunks.
 */
export function longBankQuestions(): BankQuestion[] {
  const assess = TOPICS.flatMap((topic, index) => [
    topic.alsoReport ? reportAllQuestion(topic, index) : reportQuestion(topic, index, true),
    firstActionQuestion(topic, index),
  ]);
  return [...assess, ...TOPICS.map(teachingQuestion)];
}

const label = (index: number): string => `${index + 1}.`;

const optionLines = (question: BankQuestion): string[] =>
  question.options.map((text, place) => `${letter(place)}. ${text}`);

/** The sixty as a Word document: every line a paragraph, the key on a line under its options. */
export function sixtyDocx(): CorpusDocument {
  const questions = sixtyQuestions();
  const body = [
    para(run(SIXTY_TITLE, { bold: true })),
    para(NOTICE),
    ...questions.flatMap((question, index) => [
      para(`${label(index)} ${question.stem}`),
      ...optionLines(question).map((line) => para(line)),
      para(`Answer: ${keyLetters(question)}`),
    ]),
  ].join("");
  return {
    name: SIXTY_DOCX,
    bytes: writeDocx(body),
    expected: {
      document: SIXTY_DOCX,
      covers: ["real-size-bank", "same-opening-stems"],
      questions: questions.map((question, index) =>
        expectedQuestion(`bank08_q${index + 1}`, label(index), question),
      ),
      caseStudies: [],
    },
    recording: {
      document: SIXTY_DOCX,
      source: "generated",
      questions: questions.map((question) =>
        recordedQuestion(question, { answer: `Answer: ${keyLetters(question)}` }),
      ),
      caseStudies: [],
    },
  };
}

const PDF_WIDTH = 92;
const OPTION_INDENT = "    ";

/** One question's lines on a PDF page: the stem in bold, the options, then the answer line. */
function pdfQuestion(question: BankQuestion, index: number): PdfLine[] {
  const stem = wrap(`${label(index)} ${question.stem}`, PDF_WIDTH).map((text) => ({
    text,
    bold: true,
  }));
  const options = optionLines(question).flatMap((line) =>
    wrap(line, PDF_WIDTH - OPTION_INDENT.length).map((text) => ({
      text: `${OPTION_INDENT}${text}`,
    })),
  );
  // The wider gap after the answer line is the space between two questions.
  return [...stem, ...options, { text: `Answer: ${keyLetters(question)}`, gap: PDF_LINE_GAP * 2 }];
}

const roomFor = (lines: readonly PdfLine[]): number =>
  lines.reduce((sum, line) => sum + (line.gap ?? PDF_LINE_GAP), 0);

/**
 * The sixty laid out as pages. A question is never split across two pages, so each starts on
 * one page and is whole there: `pageOf` says which, from 1, for the tests that play the model.
 */
export function sixtyPdfLayout(): { pages: PdfLine[][]; pageOf: number[] } {
  const pages: PdfLine[][] = [
    [
      { text: SIXTY_TITLE, bold: true, size: 14, gap: 18 },
      { text: NOTICE, size: 9, gap: 26 },
    ],
  ];
  const pageOf: number[] = [];
  sixtyQuestions().forEach((question, index) => {
    const lines = pdfQuestion(question, index);
    if (roomFor(pages[pages.length - 1]) + roomFor(lines) > PDF_PAGE_ROOM) pages.push([]);
    pages[pages.length - 1].push(...lines);
    pageOf.push(pages.length);
  });
  return { pages, pageOf };
}

/** The sixty as a text PDF, long enough for two chunks that share a page. */
export function sixtyPdf(): CorpusDocument {
  const questions = sixtyQuestions();
  return {
    name: SIXTY_PDF,
    bytes: writePdf(sixtyPdfLayout().pages, SIXTY_TITLE),
    expected: {
      document: SIXTY_PDF,
      covers: ["real-size-bank", "pdf-shared-page"],
      questions: questions.map((question, index) =>
        expectedQuestion(`bank12_q${index + 1}`, label(index), question),
      ),
      caseStudies: [],
    },
    recording: {
      document: SIXTY_PDF,
      source: "generated",
      questions: questions.map((question) =>
        recordedQuestion(question, { answer: `Answer: ${keyLetters(question)}` }),
      ),
      caseStudies: [],
    },
  };
}

export const ANSWER_KEY_HEADING = "## Answer Key";

/** The hundred and twenty as markdown: each question one block, every key in a list at the end. */
export function longBankMd(): CorpusDocument {
  const questions = longBankQuestions();
  const text = [
    `# ${LONG_TITLE}`,
    NOTICE,
    "The answer key is at the end of this document.",
    ...questions.map((question, index) =>
      [`${label(index)} ${question.stem}`, ...optionLines(question)].join("\n"),
    ),
    [
      ANSWER_KEY_HEADING,
      "",
      ...questions.map((question, index) => `${label(index)} ${keyLetters(question)}`),
    ].join("\n"),
  ].join("\n\n");
  return {
    name: LONG_BANK_MD,
    bytes: new TextEncoder().encode(`${text}\n`),
    expected: {
      document: LONG_BANK_MD,
      covers: ["multi-chunk-text", "same-opening-stems", "answers-at-the-back"],
      questions: questions.map((question, index) =>
        expectedQuestion(`bank09_q${index + 1}`, label(index), question),
      ),
      caseStudies: [],
    },
    recording: {
      document: LONG_BANK_MD,
      source: "generated",
      // The key line at the back is "12. B": the model is given it with the question and copies
      // the letters, as the answers-at-the-back document's recording does.
      questions: questions.map((question) =>
        recordedQuestion(question, { answer: keyLetters(question) }),
      ),
      caseStudies: [],
    },
  };
}
