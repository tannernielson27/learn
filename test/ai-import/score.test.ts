import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  standaloneChartDraftSchema,
  standaloneRecordFrom,
  toCaseStudyDraft,
  toDraft,
  toMultipleChoiceDraft,
  type DraftType,
} from "@/lib/ngn/draft";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { stagedCaseStudy } from "@/lib/ngn/fixtures/chart-reveal";
import {
  caseStudySchema,
  ITEM_SCHEMAS,
  ITEM_TYPES,
  type CaseStudy,
  type ItemOf,
} from "@/lib/ngn/schemas";
import {
  loadExpected,
  loadRecordings,
  NOT_IMPORTABLE,
  type ExpectedDocument,
  type RecordedQuestion,
  type Recording,
} from "./files";
import {
  buildReport,
  formatReport,
  isPerfect,
  scoreDocument,
  similarity,
  type QuestionResult,
} from "./score";

const DOC = "fixture-document.md";

/** Every type's canonical fixture as it should import, keyed. */
const items = ITEM_TYPES.map((type) => ITEM_SCHEMAS[type].parse(FIXTURES[type].canonical));
const draftOf = (item: (typeof items)[number]) => toDraft(item as ItemOf<DraftType>);

const discussion = {
  label: "Discussion",
  status: NOT_IMPORTABLE,
  opening: "In pairs, talk through how you would explain fluid restriction to a family",
  reason: "An open discussion prompt.",
} as const;

const expectedDoc = (overrides: Partial<ExpectedDocument> = {}): ExpectedDocument => ({
  document: DOC,
  covers: ["asterisk-spaced"],
  questions: [
    ...items.map((item) => ({
      label: item.type,
      status: "ready" as const,
      item: item as unknown as Record<string, unknown>,
    })),
    discussion,
  ],
  caseStudies: [],
  ...overrides,
});

const perfectQuestions = (): RecordedQuestion[] => [
  ...items.map((item) => ({ opening: item.stem.value, type: item.type, draft: draftOf(item) })),
  { opening: discussion.opening, type: NOT_IMPORTABLE, reason: "Open prompt." },
];

const recording = (questions: RecordedQuestion[], caseStudies: unknown[] = []): Recording => ({
  document: DOC,
  source: "test",
  questions,
  caseStudies: caseStudies.map((draft) => ({ draft })),
});

const resultFor = (results: QuestionResult[], label: string): QuestionResult => {
  const found = results.find((result) => result.label === label);
  if (!found) throw new Error(`no result for ${label}`);
  return found;
};

/** Recorded questions with the multiple choice draft replaced. */
const withMultipleChoice = (draft: unknown): RecordedQuestion[] =>
  perfectQuestions().map((entry) =>
    entry.type === "multiple_choice" ? { ...entry, draft } : entry,
  );

const mcItem = items.find((item) => item.type === "multiple_choice") as ItemOf<"multiple_choice">;
const mcDraft = toMultipleChoiceDraft(mcItem);
const markedOnly = (marked: number[]) => ({
  ...mcDraft,
  options: mcItem.content.options.map((option, index) => ({
    text: marked.includes(index) ? `${option.label} *` : option.label,
  })),
});

describe("scoreDocument", () => {
  it("scores a perfect recording 100%, every type and the not-importable bucket", () => {
    const report = buildReport([scoreDocument(expectedDoc(), recording(perfectQuestions()))]);
    expect(isPerfect(report)).toBe(true);
    expect(report.rows.map((row) => row.bucket)).toEqual([...ITEM_TYPES, NOT_IMPORTABLE]);
    expect(report.total.count).toBe(ITEM_TYPES.length + 1);
    for (const tally of [report.total.type, report.total.key, report.total.options]) {
      expect(tally.passed).toBe(tally.of);
    }
    expect(report.total.key.of).toBe(ITEM_TYPES.length);
    expect(formatReport(report)).toContain("No failures.");
  });

  it("catches a wrong key, and only the key", () => {
    const correct = mcItem.content.options.findIndex(
      (option) => option.id === mcItem.answerKey.correctOptionId,
    );
    const wrong = (correct + 1) % mcItem.content.options.length;
    const score = scoreDocument(expectedDoc(), recording(withMultipleChoice(markedOnly([wrong]))));
    const result = resultFor(score.questions, "multiple_choice");
    expect(result).toMatchObject({
      found: true,
      type: true,
      key: false,
      stem: true,
      options: true,
      inventedKey: false,
    });
    const report = buildReport([score]);
    expect(isPerfect(report)).toBe(false);
    expect(formatReport(report)).toMatch(/multiple_choice: key "/);
  });

  describe("a question the source leaves unmarked", () => {
    const unmarked = { ...mcDraft, options: markedOnly([]).options };
    const expected = () => {
      const doc = expectedDoc();
      return {
        ...doc,
        questions: doc.questions.map((question) =>
          question.label === "multiple_choice"
            ? {
                ...question,
                status: "needs_answer" as const,
                item: {
                  ...(question as { item: Record<string, unknown> }).item,
                  answerKey: { correctOptionId: "" },
                },
              }
            : question,
        ),
      };
    };

    it("passes when the pipeline leaves it without a key", () => {
      const score = scoreDocument(expected(), recording(withMultipleChoice(unmarked)));
      expect(resultFor(score.questions, "multiple_choice")).toMatchObject({
        key: true,
        inventedKey: false,
        valid: true,
      });
      expect(isPerfect(buildReport([score]))).toBe(true);
    });

    it("fails when the pipeline invents a key, as an injected instruction would ask", () => {
      const everyOption = markedOnly(mcItem.content.options.map((_, index) => index));
      const score = scoreDocument(expected(), recording(withMultipleChoice(everyOption)));
      const result = resultFor(score.questions, "multiple_choice");
      expect(result).toMatchObject({ key: false, inventedKey: true });
      const report = buildReport([score]);
      expect(report.inventedKeys).toBe(1);
      expect(isPerfect(report)).toBe(false);
      expect(formatReport(report)).toContain("invented a key the source does not have");
    });

    it("fails when it invents a single key", () => {
      const score = scoreDocument(expected(), recording(withMultipleChoice(markedOnly([0]))));
      expect(resultFor(score.questions, "multiple_choice").inventedKey).toBe(true);
    });
  });

  it("catches a changed stem and a changed option", () => {
    const unkeyed = mcItem.content.options.findIndex(
      (option) => option.id !== mcItem.answerKey.correctOptionId,
    );
    const draft = {
      ...mcDraft,
      stem: `${mcDraft.stem} Explain.`,
      options: mcDraft.options.map((option, index) =>
        index === unkeyed ? { ...option, text: `${option.text}, twice` } : option,
      ),
    };
    const score = scoreDocument(expectedDoc(), recording(withMultipleChoice(draft)));
    expect(resultFor(score.questions, "multiple_choice")).toMatchObject({
      type: true,
      key: true,
      stem: false,
      options: false,
    });
  });

  it("catches a wrong type", () => {
    const mr = items.find((item) => item.type === "matrix_multiple_response")!;
    const asChoice = { ...draftOf(mr), type: "matrix_multiple_choice" };
    const questions = perfectQuestions().map((entry) =>
      entry.type === "matrix_multiple_response"
        ? { ...entry, type: "matrix_multiple_choice", draft: asChoice }
        : entry,
    );
    const result = resultFor(
      scoreDocument(expectedDoc(), recording(questions)).questions,
      "matrix_multiple_response",
    );
    expect(result.type).toBe(false);
    expect(result.notes[0]).toMatch(/typed matrix_multiple_choice/);
  });

  it("scores the not-importable bucket both ways", () => {
    const questions = perfectQuestions().map((entry): RecordedQuestion => {
      if (entry.type === NOT_IMPORTABLE) {
        return {
          opening: entry.opening,
          type: "multiple_choice",
          draft: { ...mcDraft, stem: discussion.opening },
        };
      }
      if (entry.type === "bowtie")
        return { opening: entry.opening, type: NOT_IMPORTABLE, reason: "Too hard." };
      return entry;
    });
    const score = scoreDocument(expectedDoc(), recording(questions));
    expect(resultFor(score.questions, "Discussion")).toMatchObject({
      found: true,
      type: false,
      key: null,
    });
    expect(resultFor(score.questions, "bowtie")).toMatchObject({
      found: true,
      type: false,
      key: false,
    });
    expect(formatReport(buildReport([score]))).toContain(
      "put in the not-importable bucket: Too hard.",
    );
  });

  it("reports a question the pipeline missed, and one the source does not have", () => {
    const questions = [
      ...perfectQuestions().filter((entry) => entry.type !== "bowtie"),
      {
        opening: "Case Study Question 1 of 6: a heading the source never printed",
        type: NOT_IMPORTABLE,
      },
    ];
    const score = scoreDocument(expectedDoc(), recording(questions));
    expect(resultFor(score.questions, "bowtie")).toMatchObject({
      found: false,
      type: false,
      key: false,
    });
    expect(score.extras).toEqual([
      "Case Study Question 1 of 6: a heading the source never printed",
    ]);
    const report = buildReport([score]);
    expect(report.extras).toBe(1);
    expect(isPerfect(report)).toBe(false);
  });

  it("counts a draft that does not parse as a failure", () => {
    const score = scoreDocument(
      expectedDoc(),
      recording(withMultipleChoice({ type: "multiple_choice", stem: mcDraft.stem })),
    );
    expect(resultFor(score.questions, "multiple_choice")).toMatchObject({
      found: true,
      type: true,
      key: false,
      notes: ["the draft does not parse as an item draft"],
    });
  });

  it("flags a draft that converts with a needs_fix reason as not valid", () => {
    const disagree = { ...markedOnly([0]), answer: "B" };
    const result = resultFor(
      scoreDocument(expectedDoc(), recording(withMultipleChoice(disagree))).questions,
      "multiple_choice",
    );
    expect(result.valid).toBe(false);
    expect(result.notes.some((note) => note.startsWith("needs fix:"))).toBe(true);
  });

  it("scores a document with no recording as all missed", () => {
    const report = buildReport([scoreDocument(expectedDoc(), undefined)]);
    expect(report.total.type.passed).toBe(0);
    expect(report.total.key).toEqual({ passed: 0, of: ITEM_TYPES.length });
  });
});

describe("case studies", () => {
  const caseStudy = caseStudySchema.parse(stagedCaseStudy) as CaseStudy;
  const expected = expectedDoc({
    questions: [],
    caseStudies: [{ label: "Case", caseStudy: caseStudy as unknown as Record<string, unknown> }],
  });

  it("scores a perfect case study: every step and the chart at every step", () => {
    const score = scoreDocument(expected, recording([], [toCaseStudyDraft(caseStudy)]));
    expect(score.caseStudies).toEqual([
      expect.objectContaining({ found: true, chart: true, notes: [] }),
    ]);
    expect(score.questions).toHaveLength(6);
    expect(isPerfect(buildReport([score]))).toBe(true);
  });

  it("catches a chart that shows a note at the wrong step", () => {
    const draft = toCaseStudyDraft(caseStudy);
    const charts = draft.charts.map((chart, index) =>
      index === 0 ? draft.charts[draft.charts.length - 1] : chart,
    );
    const score = scoreDocument(expected, recording([], [{ ...draft, charts }]));
    expect(score.caseStudies[0].chart).toBe(false);
    expect(isPerfect(buildReport([score]))).toBe(false);
  });

  it("catches a changed stem in one step", () => {
    const draft = toCaseStudyDraft(caseStudy);
    const steps = draft.steps.map((step, index) =>
      index === 0 ? { ...step, stem: "An unrelated opening that changes the stem." } : step,
    );
    const score = scoreDocument(expected, recording([], [{ ...draft, steps }]));
    expect(score.questions[0]).toMatchObject({ label: "Case, step 1", stem: false });
  });

  it("reports a missing case study, a bad one and an extra one", () => {
    const missing = scoreDocument(expected, recording([]));
    expect(missing.caseStudies[0]).toMatchObject({ found: false, chart: false });
    expect(missing.questions.every((result) => !result.found)).toBe(true);

    const bad = scoreDocument(expected, recording([], [{ title: caseStudy.title, charts: "?" }]));
    expect(bad.caseStudies[0]).toMatchObject({
      found: true,
      notes: ["the case study draft does not parse"],
    });

    const extra = scoreDocument(
      expectedDoc({ questions: [] }),
      recording([], [toCaseStudyDraft(caseStudy)]),
    );
    expect(extra.extras).toEqual([`case study "${caseStudy.title}"`]);
  });

  it("scores a group that is not six steps as the standalone questions the assembly makes", () => {
    const draft = toCaseStudyDraft(caseStudy);
    const score = scoreDocument(
      expected,
      recording([], [{ ...draft, steps: draft.steps.slice(0, 5) }]),
    );
    expect(score.caseStudies[0]).toMatchObject({ found: false, chart: false });
    expect(score.extras).toHaveLength(5);
  });
});

describe("a standalone question's own record", () => {
  const chart = {
    patient: { age: "71", sex: "male", setting: "Medical unit" },
    chart: {
      tabs: [
        {
          title: "Vital Signs",
          sections: [
            { kind: "table", columns: ["", "0800", "1200"], rows: [["Heart rate", "92", "104"]] },
          ],
        },
      ],
    },
  };
  const item = items.find((entry) => entry.type === "multiple_choice")!;
  const ehr = standaloneRecordFrom(standaloneChartDraftSchema.parse(chart)).record;
  const expected = expectedDoc({
    questions: [
      {
        label: "Trend",
        status: "ready",
        item: { ...item, ehr } as unknown as Record<string, unknown>,
      },
    ],
  });
  const question = (extra: Partial<RecordedQuestion> = {}): RecordedQuestion => ({
    opening: item.stem.value,
    type: item.type,
    draft: draftOf(item),
    ...extra,
  });

  it("passes when the record matches", () => {
    const score = scoreDocument(expected, recording([question({ chart })]));
    expect(score.caseStudies).toEqual([
      expect.objectContaining({ label: "Trend, own record", found: true, chart: true }),
    ]);
  });

  it("fails a missing, different or unexpected record", () => {
    const missing = scoreDocument(expected, recording([question()]));
    expect(missing.caseStudies[0]).toMatchObject({ chart: false, notes: ["no record"] });

    const other = { ...chart, patient: { ...chart.patient, age: "70" } };
    const different = scoreDocument(expected, recording([question({ chart: other })]));
    expect(different.caseStudies[0].notes[0]).toBe("the record differs from the expected one");

    const plain = expectedDoc({
      questions: [
        { label: "Plain", status: "ready", item: item as unknown as Record<string, unknown> },
      ],
    });
    const unexpected = scoreDocument(plain, recording([question({ chart })]));
    expect(unexpected.caseStudies[0].notes[0]).toBe("a record the source does not give it");

    const notFound = scoreDocument(expected, recording([]));
    expect(notFound.caseStudies[0]).toMatchObject({ found: false, notes: ["not found"] });
  });
});

describe("similarity", () => {
  it("is 1 for the same opening and 0 for nothing in common", () => {
    expect(similarity("Which finding needs follow-up?", "which finding NEEDS follow-up")).toBe(1);
    expect(similarity("Which finding needs follow-up?", "Calculate the dose")).toBe(0);
    expect(similarity("", "anything")).toBe(0);
  });
});

describe("file loaders", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("returns nothing for a folder that does not exist", () => {
    expect(loadExpected(join(tmpdir(), "no-such-folder-339"))).toEqual([]);
    expect(loadRecordings(join(tmpdir(), "no-such-folder-339")).size).toBe(0);
  });

  it("names the file that does not parse", () => {
    dir = mkdtempSync(join(tmpdir(), "ai-import-"));
    writeFileSync(join(dir, "bad.expected.json"), JSON.stringify({ document: "x.md" }));
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ document: "x.md", questions: "no" }));
    expect(() => loadExpected(dir)).toThrow(/bad\.expected\.json/);
    expect(() => loadRecordings(dir)).toThrow(/bad\.expected\.json|bad\.json/);
  });
});
