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

  // #592: this test used to expect the first question of a text chunk to be dropped as a repeat
  // of the last question of the chunk before. Text chunks share no text, so that rule only ever
  // merged two real questions that open alike; a true repeat is flagged by the duplicate pass.
  it("keeps two questions either side of a text chunk boundary that open with the same words", () => {
    const opening = "A nurse is caring for a client who has heart failure.";
    const merged = mergeSegments([
      chunk(0, [q(0, 0, "One"), q(0, 1, `${opening} Which finding is expected?`, { number: "2" })]),
      chunk(1, [
        q(1, 0, `${opening} Which action is the priority?`, { number: "3" }),
        q(1, 1, "Another question"),
      ]),
    ]);
    expect(merged.questions.map((x) => [x.number, x.chunks])).toEqual([
      [null, [0]],
      ["2", [0]],
      ["3", [1]],
      [null, [1]],
    ]);
  });

  // #592: only the last question before the boundary was compared, so the others were staged twice.
  it("keeps each of several questions that start on a shared PDF page once", () => {
    const merged = mergeSegments([
      chunk(
        0,
        [
          q(0, 0, "Earlier question on page seven", { page: 7 }),
          q(0, 1, "First question on the shared page", { page: 8, number: "5" }),
          q(0, 2, "Second question on the shared page", { page: 8, number: "6" }),
          q(0, 3, "Third question on the shared page, cut by the page end", {
            page: 8,
            number: "7",
            cutOff: true,
          }),
        ],
        [],
        [1, 8],
      ),
      chunk(
        1,
        [
          q(1, 0, "First question on the shared page", { page: 8 }),
          q(1, 1, "Second question on the shared page", { page: 8 }),
          q(1, 2, "Third question on the shared page, cut by the page end", { page: 8 }),
          q(1, 3, "A question on page nine", { page: 9 }),
        ],
        [],
        [8, 15],
      ),
    ]);
    expect(merged.questions.map((x) => [x.position, x.number, x.chunks, x.cutOff])).toEqual([
      [0, null, [0], false],
      [1, "5", [0, 1], false],
      [2, "6", [0, 1], false],
      [3, "7", [0, 1], false],
      [4, null, [1], false],
    ]);
  });

  it("pairs two shared-page questions that open alike one to one, and never across three chunks", () => {
    const same = "Which finding requires follow-up by the nurse today?";
    const merged = mergeSegments([
      chunk(0, [q(0, 0, same, { page: 8 }), q(0, 1, same, { page: 8 })], [], [1, 8]),
      chunk(1, [q(1, 0, same, { page: 8 }), q(1, 1, same, { page: 8 })], [], [8, 15]),
      chunk(2, [q(2, 0, same, { page: 15 })], [], [15, 20]),
    ]);
    expect(merged.questions.map((x) => x.chunks)).toEqual([[0, 1], [0, 1], [2]]);
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

describe("mergeSegments: a case study step that opens the next part", () => {
  const DKA = "Unfolding Case Study: Diabetic Ketoacidosis";
  const steps = (count: number, more: (step: number) => Partial<SegmentQuestion> = () => ({})) =>
    Array.from({ length: count }, (_, i) =>
      q(0, i, `Step ${i + 1} opening`, {
        number: `Question ${i + 1} of 6`,
        group: { title: DKA, step: i + 1 },
        ...more(i + 1),
      }),
    );
  const groups = (merged: ReturnType<typeof mergeSegments>) =>
    merged.questions.map((x) => (x.group ? `${x.group.title}#${x.group.step}` : null));

  // Prod, 2026-11-20: part 2 of corpus document 11 opened with "Question 6 of 6" and its segment
  // read gave it no case study, so the case had five steps and its record was dropped.
  it("joins an untitled question that opens the next part to the short case study before it", () => {
    const merged = mergeSegments([
      chunk(0, steps(5)),
      chunk(1, [q(1, 0, "For each finding, indicate whether", { number: "Question 6 of 6" })]),
    ]);
    expect(groups(merged).at(-1)).toBe(`${DKA}#6`);
  });

  it("joins one with no number, and one whose number continues the steps' own numbering", () => {
    const unnumbered = mergeSegments([chunk(0, steps(5)), chunk(1, [q(1, 0, "For each finding")])]);
    expect(groups(unnumbered).at(-1)).toBe(`${DKA}#6`);
    // Steps numbered with the quiz (13 to 17), no step numbers printed.
    const quizNumbered = mergeSegments([
      chunk(
        0,
        steps(5, (s) => ({ number: String(12 + s), group: { title: DKA, step: null } })),
      ),
      chunk(1, [q(1, 0, "For each finding", { number: "18." })]),
    ]);
    expect(groups(quizNumbered).at(-1)).toBe(`${DKA}#null`);
  });

  it("joins a run of them until the case study has six steps, and no further", () => {
    const merged = mergeSegments([
      chunk(0, steps(4)),
      chunk(1, [q(1, 0, "Fifth"), q(1, 1, "Sixth"), q(1, 2, "A standalone question")]),
    ]);
    expect(groups(merged).slice(4)).toEqual([`${DKA}#5`, `${DKA}#6`, null]);
  });

  it("leaves it alone when the case study is whole, or the question sits in the same part", () => {
    const whole = mergeSegments([chunk(0, steps(6)), chunk(1, [q(1, 0, "Standalone")])]);
    expect(groups(whole).at(-1)).toBeNull();
    const samePart = mergeSegments([chunk(0, [...steps(5), q(0, 5, "Standalone")])]);
    expect(groups(samePart).at(-1)).toBeNull();
  });

  it("leaves it alone when its printed number is not the next step", () => {
    const merged = mergeSegments([
      chunk(0, steps(5)),
      chunk(1, [q(1, 0, "Standalone", { number: "12" })]),
    ]);
    expect(groups(merged).at(-1)).toBeNull();
  });

  it("leaves it alone across a missing part, or after a part that ends with a standalone question", () => {
    const gap = mergeSegments([chunk(0, steps(5)), chunk(2, [q(2, 0, "Standalone")])]);
    expect(groups(gap).at(-1)).toBeNull();
    const standaloneLast = mergeSegments([
      chunk(0, [...steps(5), q(0, 5, "Standalone one")]),
      chunk(1, [q(1, 0, "Standalone two")]),
    ]);
    expect(groups(standaloneLast).slice(5)).toEqual([null, null]);
  });

  it("leaves an unnumbered question alone when no step says the case study has six", () => {
    const merged = mergeSegments([
      chunk(
        0,
        steps(5, () => ({ number: null })),
      ),
      chunk(1, [q(1, 0, "A standalone question in a quiz that numbers nothing")]),
    ]);
    expect(groups(merged).at(-1)).toBeNull();
  });

  it("leaves alone a question with no NGN type, one the part opens partway through, and a step read again", () => {
    const untyped = mergeSegments([
      chunk(0, steps(5)),
      chunk(1, [q(1, 0, "Discuss with a partner", { type: null })]),
    ]);
    expect(groups(untyped).at(-1)).toBeNull();
    // Step 5 runs past its part: what opens the next part may be the rest of it.
    const cut = mergeSegments([
      chunk(
        0,
        steps(5, (s) => ({ cutOff: s === 5 })),
      ),
      chunk(1, [q(1, 0, "Which findings show", { number: "Question 6 of 6" })]),
    ]);
    expect(groups(cut).at(-1)).toBeNull();
    const continued = mergeSegments([
      chunk(0, steps(5)),
      chunk(1, [q(1, 0, "and the rest of it", { continued: true })]),
    ]);
    expect(groups(continued).at(-1)).toBeNull();
    // A shared PDF page: step 5 read again untitled, its opening past the dedup's eight words.
    const reread = mergeSegments([chunk(0, steps(5)), chunk(1, [q(1, 0, "Step 5 opening")])]);
    expect(groups(reread).at(-1)).toBeNull();
  });

  it("numbers the joined step after the case study's highest, whatever order the steps came in", () => {
    const merged = mergeSegments([
      chunk(
        0,
        steps(5, (s) => ({ group: { title: DKA, step: [1, 2, 3, 5, 4][s - 1] } })),
      ),
      chunk(1, [q(1, 0, "For each finding", { number: "Question 6 of 6" })]),
    ]);
    expect(groups(merged).at(-1)).toBe(`${DKA}#6`);
  });

  it("joins under the title as the case study printed it, clears the question's own chart, and lets its answer link", () => {
    const merged = mergeSegments([
      chunk(0, [
        q(0, 0, "Ectopic step", {
          number: "Question 1 of 6",
          group: { title: "Ectopic", step: 1 },
        }),
        ...steps(5),
      ]),
      chunk(
        1,
        [
          q(1, 0, "For each finding", {
            number: "Question 6 of 6",
            flags: { ...q(1, 0, "x").flags, ownChart: true },
          }),
        ],
        [
          a(1, "6", "Improved, Improved", {
            caseStudy: "unfolding case study:  diabetic ketoacidosis",
          }),
        ],
      ),
    ]);
    const joined = merged.questions.at(-1);
    expect(joined?.group).toEqual({ title: DKA, step: 6 });
    expect(joined?.flags.ownChart).toBe(false);
    expect(joined?.answers.map((x) => x.text)).toEqual(["Improved, Improved"]);
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
