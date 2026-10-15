import { describe, expect, it } from "vitest";
import { mergeSegments, questionNumberKey } from "./merge";
import type { ChunkSegment, SegmentAnswer, SegmentQuestion } from "./segment";

function q(chunk: number, index: number, excerpt: string, more: Partial<SegmentQuestion> = {}) {
  return {
    chunk,
    index,
    excerpt,
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
    ...more,
  } satisfies SegmentQuestion;
}

function a(chunk: number, number: string, text: string, more: Partial<SegmentAnswer> = {}) {
  return {
    chunk,
    number,
    caseStudy: null,
    kind: "answer",
    text,
    sourceChecked: true,
    ...more,
  } satisfies SegmentAnswer;
}

function chunk(
  position: number,
  questions: SegmentQuestion[],
  answers: SegmentAnswer[] = [],
  pages: [number, number] | null = null,
): ChunkSegment {
  return {
    position,
    pageFrom: pages?.[0] ?? null,
    pageTo: pages?.[1] ?? null,
    questions,
    answers,
    droppedAnswers: 0,
    source: { author: null, objectives: [], references: [] },
  };
}

describe("mergeSegments", () => {
  it("attaches answers at the back of chunk 3 to questions in chunk 1", () => {
    const merged = mergeSegments([
      chunk(2, [], [a(2, "1.", "B"), a(2, "Question 2", "A, C")]),
      chunk(0, [q(0, 0, "First question", { number: "1" }), q(0, 1, "Second", { number: "2" })]),
      chunk(1, [q(1, 0, "Third", { number: "3" })]),
    ]);
    expect(
      merged.questions.map((x) => [x.position, x.excerpt, x.answers.map((y) => y.text)]),
    ).toEqual([
      [0, "First question", ["B"]],
      [1, "Second", ["A, C"]],
      [2, "Third", []],
    ]);
    expect(merged.unlinkedAnswers).toEqual([]);
  });

  it("joins a question split across a chunk boundary, once", () => {
    const merged = mergeSegments([
      chunk(0, [
        q(0, 0, "Intro question", { number: "1" }),
        q(0, 1, "A client has been vomiting for 2 days", {
          number: "2",
          cutOff: true,
          type: null,
          flags: {
            instructorNote: true,
            reliesOnImage: false,
            notNgn: "",
            notInSource: false,
            ownChart: false,
          },
        }),
      ]),
      chunk(1, [
        q(1, 0, "as evidenced by the serum potassium", {
          continued: true,
          type: "dropdown_rationale",
          confidence: 0.6,
          scoringRule: "Scoring Rule: Rationale",
        }),
        q(1, 1, "Next question", { number: "3" }),
      ]),
    ]);
    expect(merged.questions).toHaveLength(3);
    expect(merged.questions[1]).toMatchObject({
      position: 1,
      excerpt: "A client has been vomiting for 2 days",
      number: "2",
      type: "dropdown_rationale",
      confidence: 0.6,
      scoringRule: "Scoring Rule: Rationale",
      chunks: [0, 1],
      cutOff: false,
      continued: false,
    });
    expect(merged.questions[1].flags).toEqual({
      instructorNote: true,
      reliesOnImage: false,
      notNgn: null,
      notInSource: false,
      ownChart: false,
    });
  });

  it("does not join across a chunk that is missing", () => {
    const merged = mergeSegments([
      chunk(0, [q(0, 0, "Cut", { cutOff: true })]),
      chunk(2, [q(2, 0, "rest of something", { continued: true })]),
    ]);
    expect(merged.questions).toHaveLength(2);
  });

  it("keeps a question on a shared PDF page once, from the chunk that saw it whole", () => {
    const merged = mergeSegments([
      chunk(
        0,
        [
          q(0, 0, "Page one question", { page: 1 }),
          q(0, 1, "The nurse reviews the vital signs below and decides", {
            page: 8,
            cutOff: true,
            number: "6",
          }),
        ],
        [],
        [1, 8],
      ),
      chunk(
        1,
        [
          q(1, 0, "The nurse reviews the vital signs below, and decides which", {
            page: 8,
            type: "matrix_multiple_choice",
          }),
          q(1, 1, "Later question", { page: 10 }),
        ],
        [],
        [8, 15],
      ),
    ]);
    expect(merged.questions.map((x) => x.excerpt)).toEqual([
      "Page one question",
      "The nurse reviews the vital signs below, and decides which",
      "Later question",
    ]);
    expect(merged.questions[1]).toMatchObject({
      number: "6",
      chunks: [0, 1],
      cutOff: false,
      chunk: 0,
    });
  });

  it("keeps the earlier read when both saw the shared-page question whole", () => {
    const merged = mergeSegments([
      chunk(
        0,
        [q(0, 0, "Same opening words for a question here", { page: 8, number: "4" })],
        [],
        [1, 8],
      ),
      chunk(1, [q(1, 0, "Same opening words for a question here", { page: 8 })], [], [8, 15]),
    ]);
    expect(merged.questions).toHaveLength(1);
    expect(merged.questions[0]).toMatchObject({ number: "4", chunk: 0 });
  });

  it("keeps two questions with the same opening that are not on the shared page", () => {
    const merged = mergeSegments([
      chunk(0, [q(0, 0, "Which finding requires follow-up?", { page: 3 })], [], [1, 8]),
      chunk(1, [q(1, 0, "Which finding requires follow-up?", { page: 9 })], [], [8, 15]),
    ]);
    expect(merged.questions).toHaveLength(2);
  });

  it("drops a text chunk's repeat of the question it ended on", () => {
    const merged = mergeSegments([
      chunk(0, [q(0, 0, "One"), q(0, 1, "Boundary question text")]),
      chunk(1, [q(1, 0, "Boundary question text"), q(1, 1, "Boundary question text")]),
    ]);
    expect(merged.questions.map((x) => x.excerpt)).toEqual([
      "One",
      "Boundary question text",
      "Boundary question text",
    ]);
  });

  it("links answers by case study when two questions share a number, and never guesses", () => {
    const merged = mergeSegments([
      chunk(
        0,
        [
          q(0, 0, "Ectopic step one", {
            number: "1",
            group: { title: "Ectopic pregnancy", step: 1 },
          }),
          q(0, 1, "TB step one", { number: "1", group: { title: "Tuberculosis", step: 1 } }),
          q(0, 2, "No number"),
        ],
        [
          a(0, "1", "C", { caseStudy: "ECTOPIC pregnancy" }),
          a(0, "1", "D"),
          a(0, "9", "A"),
          a(0, "Key", "B"),
          a(0, "1", "C", { caseStudy: "Ectopic pregnancy", chunk: 1 }),
        ],
      ),
    ]);
    expect(merged.questions[0].answers.map((x) => x.text)).toEqual(["C"]);
    expect(merged.questions[1].answers).toEqual([]);
    expect(merged.unlinkedAnswers.map((x) => x.text)).toEqual(["D", "A", "B"]);
  });

  it("is empty for no chunks", () => {
    expect(mergeSegments([])).toEqual({ questions: [], unlinkedAnswers: [] });
  });
});

describe("questionNumberKey", () => {
  it.each([
    ["4", "4"],
    ["4.", "4"],
    ["Question 04", "4"],
    ["3a", "3a"],
    ["3 B", "3b"],
    ["Key", "key"],
    ["—", null],
    [null, null],
  ])("%s -> %s", (number, key) => {
    expect(questionNumberKey(number)).toBe(key);
  });
});
