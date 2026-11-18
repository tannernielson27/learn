import { describe, expect, it } from "vitest";
import type { ChunkSegment, SegmentAnswer, SegmentQuestion } from "./segment";
import { joinParts, splitPages, splitText } from "./segmentSplit";

const question = (fields: Partial<SegmentQuestion> = {}): SegmentQuestion => ({
  chunk: 3,
  index: 0,
  excerpt: "Which action should the nurse take first for this client?",
  number: null,
  page: null,
  type: "multiple_choice",
  confidence: 0.9,
  group: null,
  scoringRule: null,
  flags: {
    instructorNote: false,
    reliesOnImage: false,
    notNgn: null,
    notInSource: false,
    ownChart: false,
  },
  sourceChecked: true,
  cutOff: false,
  continued: false,
  ...fields,
});

const answer = (fields: Partial<SegmentAnswer> = {}): SegmentAnswer => ({
  chunk: 3,
  number: "1",
  caseStudy: null,
  kind: "answer",
  text: "B",
  sourceChecked: true,
  ...fields,
});

const part = (fields: Partial<ChunkSegment> = {}): ChunkSegment => ({
  position: 3,
  pageFrom: null,
  pageTo: null,
  questions: [],
  answers: [],
  droppedAnswers: 0,
  source: { author: null, objectives: [], references: [] },
  ...fields,
});

/** `count` numbered questions, each a stem and four options in blocks of their own. */
const numbered = (count: number, from = 1) =>
  Array.from({ length: count }, (_, i) =>
    [`${from + i}. Which finding matters most for client ${from + i}?`, "A. One", "B. Two"].join(
      "\n\n",
    ),
  ).join("\n\n");

describe("splitText", () => {
  it("cuts where a numbered question starts, nearest the middle", () => {
    const text = numbered(10);
    const halves = splitText(text);
    expect(halves).not.toBeNull();
    const [first, second] = halves!;
    expect(second.startsWith("6. Which finding")).toBe(true);
    expect(first.endsWith("B. Two")).toBe(true);
    // Nothing is lost but the blank line between them.
    expect(`${first}\n\n${second}`).toBe(text);
  });

  it("cuts at a heading, and at 'Question 4' as well as '4.'", () => {
    const headed = ["## One", "Stem one", "## Two", "Stem two"].join("\n\n");
    expect(splitText(headed)?.[1].startsWith("## Two")).toBe(true);
    const worded = ["Question 1: a", "body ".repeat(20), "Question 2: b", "body ".repeat(20)].join(
      "\n\n",
    );
    expect(splitText(worded)?.[1].startsWith("Question 2: b")).toBe(true);
  });

  it("falls back to a blank line, then a line, then a space", () => {
    const blocks = ["alpha ".repeat(30).trim(), "beta ".repeat(30).trim()].join("\n\n");
    expect(splitText(blocks)).toEqual(["alpha ".repeat(30).trim(), "beta ".repeat(30).trim()]);

    const lines = ["| a | b |", "| c | d |", "| e | f |", "| g | h |"].join("\n");
    expect(splitText(lines)).toEqual(["| a | b |\n| c | d |", "| e | f |\n| g | h |"]);

    const oneLine = "word ".repeat(40).trim();
    const [first, second] = splitText(oneLine)!;
    expect(`${first} ${second}`).toBe(oneLine);
    expect(Math.abs(first.length - second.length)).toBeLessThan(10);
  });

  it("keeps away from the ends, so each half is a real share of the text", () => {
    // The only numbered start is in the first tenth; a plain block near the middle is better.
    const text = ["intro", "1. early question", ...Array(20).fill("plain block of text")].join(
      "\n\n",
    );
    const [first, second] = splitText(text)!;
    expect(first.length).toBeGreaterThan(text.length / 4);
    expect(second.length).toBeGreaterThan(text.length / 4);
  });

  it("answers null for text that cannot be cut", () => {
    expect(splitText("x".repeat(500))).toBeNull();
    expect(splitText("")).toBeNull();
    expect(splitText("word")).toBeNull();
  });
});

describe("splitPages", () => {
  it("halves a range around a shared page, as chunks overlap", () => {
    expect(splitPages(1, 9)).toEqual([
      [1, 5],
      [5, 9],
    ]);
    expect(splitPages(9, 16)).toEqual([
      [9, 12],
      [12, 16],
    ]);
    expect(splitPages(4, 6)).toEqual([
      [4, 5],
      [5, 6],
    ]);
  });

  it("splits two pages with no overlap, and cannot split one", () => {
    expect(splitPages(7, 8)).toEqual([
      [7, 7],
      [8, 8],
    ]);
    expect(splitPages(3, 3)).toBeNull();
  });
});

describe("joinParts", () => {
  const whole = { position: 3, of: 5, pageFrom: null, pageTo: null };

  it("puts the halves' questions in order under the chunk, numbered again", () => {
    const joined = joinParts(whole, [
      part({
        questions: [question({ index: 0, excerpt: "First question of the first half here" })],
      }),
      part({
        questions: [
          question({ index: 0, excerpt: "First question of the second half here" }),
          question({ index: 1, excerpt: "Second question of the second half here" }),
        ],
      }),
    ]);
    expect(joined.position).toBe(3);
    expect(joined.questions.map((q) => [q.chunk, q.index, q.excerpt.slice(0, 15)])).toEqual([
      [3, 0, "First question "],
      [3, 1, "First question "],
      [3, 2, "Second question"],
    ]);
    // Only what a segment question holds: nothing of the merge's own.
    expect(joined.questions[0]).not.toHaveProperty("position");
    expect(joined.questions[0]).not.toHaveProperty("chunks");
    expect(joined.questions[0]).not.toHaveProperty("answers");
  });

  it("joins a question the cut ran through into one, keeping its opening", () => {
    const joined = joinParts(whole, [
      part({
        questions: [
          question({
            excerpt: "A client is admitted with chest pain and",
            number: "7",
            cutOff: true,
          }),
        ],
      }),
      part({
        questions: [
          question({ excerpt: "A. Give oxygen B. Call the provider", continued: true }),
          question({ index: 1, excerpt: "The next question stands on its own", number: "8" }),
        ],
      }),
    ]);
    expect(joined.questions.map((q) => [q.number, q.cutOff, q.continued])).toEqual([
      ["7", false, false],
      ["8", false, false],
    ]);
    expect(joined.questions[0].excerpt).toBe("A client is admitted with chest pain and");
  });

  it("keeps two questions either side of a text cut that open with the same words", () => {
    // Text halves hold nothing in common, so the same opening is not the same question.
    const stem = "A nurse is caring for a client who has";
    const joined = joinParts(whole, [
      part({
        questions: [question({ excerpt: `${stem} heart failure. Which finding`, number: "22" })],
      }),
      part({ questions: [question({ excerpt: `${stem} pneumonia. Which action`, number: "23" })] }),
    ]);
    expect(joined.questions.map((q) => q.number)).toEqual(["22", "23"]);
  });

  it("keeps every question on a shared PDF page once, however many start there", () => {
    const one = "A client reports chest pain at rest. Which action comes first";
    const two = "A client has a potassium of 6.1 mEq/L. Which finding";
    const half = (from: number, to: number, questions: SegmentQuestion[]) =>
      part({ position: 0, pageFrom: from, pageTo: to, questions });
    const on5 = (excerpt: string, index: number, fields: Partial<SegmentQuestion> = {}) =>
      question({ chunk: 0, index, excerpt, page: 5, sourceChecked: false, ...fields });
    const joined = joinParts({ position: 0, of: 1, pageFrom: 1, pageTo: 9 }, [
      // The first half sees the second question cut off at the end of its last page.
      half(1, 5, [on5(one, 0), on5(two, 1, { cutOff: true })]),
      half(5, 9, [
        on5(one, 0),
        on5(two, 1),
        question({ chunk: 0, index: 2, excerpt: one, page: 8, sourceChecked: false }),
      ]),
    ]);
    // Both shared-page questions once; the same words on page 8 are another question.
    expect(joined.questions.map((q) => [q.page, q.excerpt === one, q.cutOff])).toEqual([
      [5, true, false],
      [5, false, false],
      [8, true, false],
    ]);
  });

  it("keeps a question on the page two PDF halves share once", () => {
    const shared = "A client with heart failure gains 2 kg overnight. Which";
    const joined = joinParts({ position: 0, of: 1, pageFrom: 1, pageTo: 9 }, [
      part({
        position: 0,
        pageFrom: 1,
        pageTo: 5,
        questions: [question({ chunk: 0, excerpt: shared, page: 5, sourceChecked: false })],
      }),
      part({
        position: 0,
        pageFrom: 5,
        pageTo: 9,
        questions: [
          question({ chunk: 0, excerpt: shared, page: 5, sourceChecked: false }),
          question({ chunk: 0, index: 1, excerpt: "Another question on a later page", page: 7 }),
        ],
      }),
    ]);
    expect(joined.pageFrom).toBe(1);
    expect(joined.pageTo).toBe(9);
    expect(joined.questions.map((q) => q.page)).toEqual([5, 7]);
  });

  it("keeps every answer section once, counts the dropped ones and merges the source matter", () => {
    const joined = joinParts(whole, [
      part({
        answers: [answer({ number: "1", text: "B" })],
        droppedAnswers: 1,
        source: { author: "N. Urse, RN", objectives: ["Recognize cues"], references: [] },
      }),
      part({
        answers: [answer({ number: "1.", text: "b" }), answer({ number: "2", text: "A, C" })],
        droppedAnswers: 2,
        source: {
          author: null,
          objectives: ["Recognize cues", "Take action"],
          references: ["Ref"],
        },
      }),
    ]);
    expect(joined.answers.map((a) => [a.chunk, a.number, a.text])).toEqual([
      [3, "1", "B"],
      [3, "2", "A, C"],
    ]);
    expect(joined.droppedAnswers).toBe(3);
    expect(joined.source).toEqual({
      author: "N. Urse, RN",
      objectives: ["Recognize cues", "Take action"],
      references: ["Ref"],
    });
  });

  it("joins the joined: quarters come back as one chunk", () => {
    const quarter = (excerpt: string) => part({ questions: [question({ excerpt })] });
    const left = joinParts(whole, [
      quarter("Quarter one question text here"),
      quarter("Quarter two question text here"),
    ]);
    const right = joinParts(whole, [
      quarter("Quarter three question text here"),
      quarter("Quarter four question text here"),
    ]);
    const joined = joinParts(whole, [left, right]);
    expect(joined.questions.map((q) => q.index)).toEqual([0, 1, 2, 3]);
    expect(joined.questions.map((q) => q.excerpt.split(" ")[1])).toEqual([
      "one",
      "two",
      "three",
      "four",
    ]);
  });
});
