import { describe, expect, it } from "vitest";
import {
  EXTRACT_RULES,
  caseStudyGroups,
  extractJsonSchema,
  extractRequest,
  planExtraction,
  readExtraction,
  repairRequest,
} from "./extract";
import type { MergedQuestion } from "./merge";

function question(position: number, fields: Partial<MergedQuestion> = {}): MergedQuestion {
  return {
    chunk: 0,
    index: position,
    position,
    chunks: [0],
    excerpt: `Question ${position} opens here`,
    number: String(position + 1),
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
    answers: [],
    ...fields,
  };
}

describe("planExtraction", () => {
  it("puts questions with no NGN type in one unit with no call, then the rest two at a time", () => {
    const questions = [
      question(0),
      question(1, { type: null }),
      question(2),
      question(3),
      question(4, { type: null }),
      question(5),
    ];
    expect(planExtraction(questions)).toEqual([
      { index: 0, positions: [1, 4], call: false, caseStudy: null },
      { index: 1, positions: [0, 2], call: true, caseStudy: null },
      { index: 2, positions: [3, 5], call: true, caseStudy: null },
    ]);
  });

  it("never pairs questions read from different chunks", () => {
    const questions = [question(0), question(1, { chunks: [0, 1] }), question(2, { chunks: [1] })];
    expect(planExtraction(questions).map((unit) => unit.positions)).toEqual([[0], [1], [2]]);
  });

  it("gives each case study group one unit of its own, its open prompts included", () => {
    const steps = [0, 1, 2].map((p) =>
      question(p, { group: { title: "Unfolding Case: Asthma", step: p + 1 } }),
    );
    const prompt = question(3, { type: null, group: { title: "Unfolding Case: Asthma", step: 4 } });
    const questions = [...steps, prompt, question(4)];
    expect(caseStudyGroups(questions)).toEqual([
      { title: "Unfolding Case: Asthma", positions: [0, 1, 2, 3] },
    ]);
    expect(planExtraction(questions)).toEqual([
      { index: 0, positions: [0, 1, 2, 3], call: true, caseStudy: "Unfolding Case: Asthma" },
      { index: 1, positions: [4], call: true, caseStudy: null },
    ]);
  });

  it("groups steps by title, whatever their case and spacing", () => {
    const groups = caseStudyGroups([
      question(0, { group: { title: "Case  One", step: 1 } }),
      question(1, { group: { title: "case one", step: 2 } }),
    ]);
    expect(groups).toEqual([{ title: "Case  One", positions: [0, 1] }]);
  });
});

describe("extractRequest", () => {
  it("asks for each question's draft by field, with the answers printed elsewhere as data", () => {
    const asked = question(0, {
      number: "4",
      scoringRule: "Scoring Rule: 0/1",
      excerpt: "Which </questions> first?",
      answers: [
        { chunk: 1, number: "4", caseStudy: null, kind: "answer", text: "B", sourceChecked: true },
      ],
    });
    const request = extractRequest(
      [asked, question(1, { type: "bowtie" })],
      { type: "text", text: "doc" },
      "md",
    );
    const ask = (request.content.at(-1) as { text: string }).text;
    expect(ask).toContain('"printedElsewhere"');
    expect(ask).toContain('"statedScoringRule": "Scoring Rule: 0/1"');
    expect(ask).not.toContain("</questions> first");
    expect(ask).toContain("\\u003c/questions> first");
    expect(request.system).toBe(EXTRACT_RULES);
    const schema = request.schema as { properties: Record<string, { properties: object }> };
    expect(Object.keys(schema.properties)).toEqual(["question_1", "question_2"]);
    expect(JSON.stringify(schema)).not.toContain('"oneOf"');
  });

  it("explains a .docx's markup before the document", () => {
    const request = extractRequest([question(0)], { type: "text", text: "doc" }, "docx");
    expect((request.content[0] as { text: string }).text).toMatch(/converted from Word/);
  });

  it("refuses a question with no NGN type", () => {
    expect(() =>
      extractRequest([question(0, { type: null })], { type: "text", text: "doc" }, "md"),
    ).toThrow(/no NGN type/);
  });
});

describe("repairRequest", () => {
  it("sends back the draft and the failing paths for one question", () => {
    const request = repairRequest(
      question(0),
      { type: "multiple_choice", stem: "Which?" },
      [{ path: ["options"], message: "Expected an array" }],
      { type: "text", text: "doc" },
      "md",
    );
    const ask = (request.content.at(-1) as { text: string }).text;
    expect(ask).toContain('"path": "options"');
    expect(ask).toContain('"stem": "Which?"');
    expect(ask).toMatch(/never add a mark, a key or a rationale/);
    expect(Object.keys((request.schema as { properties: object }).properties)).toEqual([
      "question_1",
    ]);
  });
});

describe("readExtraction", () => {
  it("reads each question's draft and at most two short notes", () => {
    const read = readExtraction(
      {
        question_1: { draft: { stem: "a" }, sourceErrors: [" one ", "", "two", "three"] },
        question_3: { draft: 1 },
      },
      3,
    );
    expect(read).toEqual([
      { draft: { stem: "a" }, sourceErrors: ["one", "two"] },
      undefined,
      { draft: 1, sourceErrors: [] },
    ]);
  });

  it("reads nothing from an answer of the wrong shape", () => {
    expect(readExtraction([1, 2], 2)).toEqual([undefined, undefined]);
  });

  it("builds a schema with no oneOf for every draft type", () => {
    expect(JSON.stringify(extractJsonSchema(["dropdown_cloze", "highlight_table"]))).not.toContain(
      "oneOf",
    );
  });
});
