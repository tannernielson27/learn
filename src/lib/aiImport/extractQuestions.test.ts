import { describe, expect, it, vi } from "vitest";
import { ClaudeCallError, type StructuredRequest } from "./claude";
import { NO_USAGE } from "./config";
import { extractQuestions, regionsOf, type UnitCall } from "./extractQuestions";
import { mergeSegments, type MergedQuestion } from "./merge";
import { readSegment } from "./segment";
import {
  COURSE_ACTIVITY,
  activityExtraction,
  activitySegment,
  checkAnswerDraft,
  unmarkedMatrixDraft,
} from "./testing/extractRecordings";

const chunk = { position: 0, of: 1, pageFrom: null, pageTo: null };

function activity(text = COURSE_ACTIVITY, segment: unknown = activitySegment): MergedQuestion[] {
  return mergeSegments([readSegment(segment, chunk, { type: "text", text })]).questions;
}

const document = (text = COURSE_ACTIVITY) => ({
  payload: { type: "text" as const, text },
  kind: "md" as const,
  sourceText: text,
});

/** A call that answers from `answers` in turn, and records what it was asked. */
function recorded(...answers: unknown[]) {
  const requests: { request: StructuredRequest; purpose: string }[] = [];
  const call: UnitCall = vi.fn(async (request, purpose) => {
    requests.push({ request, purpose });
    const value = answers.shift();
    if (value instanceof Error) throw value;
    return { value, usage: NO_USAGE, attempts: 1 };
  });
  return { call, requests };
}

describe("extractQuestions on the recorded course activity", () => {
  const questions = activity();
  const regions = regionsOf(questions, COURSE_ACTIVITY);

  it("stages the unmarked matrix as needs_answer with no key, and 'Answer: ✅ B.' as key B", async () => {
    const { call, requests } = recorded(activityExtraction);
    const entries = await extractQuestions(call, questions.slice(0, 2), document(), regions);
    expect(requests).toHaveLength(1);

    const [matrix, choice] = entries;
    expect(matrix.status).toBe("needs_answer");
    expect(matrix.type).toBe("matrix_multiple_choice");
    const matrixKey = (matrix.item as { answerKey: { rows: unknown[] } }).answerKey;
    expect(JSON.stringify(matrixKey)).not.toMatch(/col_/);
    expect(matrix.reasons.map((r) => r.code)).toContain("needs_answer");
    expect(matrix.reasons.map((r) => r.code)).toContain("instructor_note");

    expect(choice.status).toBe("ready");
    expect(choice.item).toMatchObject({
      type: "multiple_choice",
      answerKey: { correctOptionId: "opt_b" },
    });
    expect(choice.reasons.map((r) => r.code)).not.toContain("check_key");
  });

  it("stages the open BMI prompt and the A-I matching as not importable, with reasons, and calls nothing", async () => {
    const { call } = recorded();
    const entries = await extractQuestions(call, questions.slice(2), document(), regions);
    expect(call).not.toHaveBeenCalled();
    expect(entries.map((e) => [e.status, e.type, e.reasons[0]])).toEqual([
      [
        "not_importable",
        null,
        { code: "not_ngn", message: "A calculation with no answer choices." },
      ],
      [
        "not_importable",
        null,
        { code: "not_ngn", message: "A matching exercise; LeaRN has no matching type." },
      ],
    ]);
  });

  it("refuses a key the source does not show: the matrix comes back marked, and is not converted", async () => {
    const invented = {
      ...unmarkedMatrixDraft,
      rows: unmarkedMatrixDraft.rows.map((row, index) => ({
        ...row,
        cells: index === 2 ? ["", "*"] : ["*", ""],
      })),
    };
    const { call, requests } = recorded({
      question_1: { draft: invented, sourceErrors: [] },
      question_2: { draft: checkAnswerDraft, sourceErrors: [] },
    });
    const [matrix, choice] = await extractQuestions(
      call,
      questions.slice(0, 2),
      document(),
      regions,
    );
    expect(requests).toHaveLength(1);
    expect(matrix).toMatchObject({ status: "needs_fix", item: null, draft: invented });
    expect(matrix.reasons[0].code).toBe("unmarked_key");
    expect(choice.status).toBe("ready");
  });

  it("repairs a draft that does not convert once, with its failing paths, then stages the repair", async () => {
    const broken = { ...checkAnswerDraft, answer: "Answer: ✅ F." };
    const { call, requests } = recorded(
      { question_1: { draft: broken, sourceErrors: [] } },
      { question_1: { draft: checkAnswerDraft, sourceErrors: ["Yogurt is listed twice."] } },
    );
    const [choice] = await extractQuestions(call, [questions[1]], document(), regions);
    expect(requests.map((r) => r.purpose)).toEqual(["extract", "repair"]);
    const repairAsk = JSON.stringify(requests[1].request.content.at(-1));
    expect(repairAsk).toContain("answer");
    expect(repairAsk).toContain("does not name one of the options");
    expect(choice.status).toBe("ready");
    expect(choice.reasons).toContainEqual({
      code: "source_error",
      message: "Possible source error: Yogurt is listed twice.",
    });
  });

  it("keeps the draft as needs_fix when the repair still does not convert", async () => {
    const broken = { ...checkAnswerDraft, answer: "Answer: ✅ F." };
    const { call } = recorded(
      { question_1: { draft: broken, sourceErrors: [] } },
      { question_1: { draft: broken, sourceErrors: [] } },
    );
    const [choice] = await extractQuestions(call, [questions[1]], document(), regions);
    expect(choice).toMatchObject({ status: "needs_fix", item: null, draft: broken });
    expect(choice.reasons[0].message).toMatch(/^answer: /);
  });

  it("keeps the first draft when the repair call fails, and when the answer leaves a question out", async () => {
    const { call } = recorded({}, new ClaudeCallError("overloaded"));
    const [choice] = await extractQuestions(call, [questions[1]], document(), regions);
    expect(choice).toMatchObject({ status: "needs_fix", item: null, draft: null });
    expect(choice.reasons[0].code).toBe("needs_fix");
  });

  it("fails the unit when the extract call fails, staging nothing", async () => {
    const { call } = recorded(new ClaudeCallError("server", NO_USAGE, 3, 500));
    await expect(
      extractQuestions(call, questions.slice(0, 2), document(), regions),
    ).rejects.toBeInstanceOf(ClaudeCallError);
  });

  it("marks a key read from a PDF for the reviewer, since nothing could check it", async () => {
    const { call } = recorded({ question_1: { draft: checkAnswerDraft, sourceErrors: [] } });
    const [choice] = await extractQuestions(
      call,
      [questions[1]],
      {
        payload: { type: "pdf", bytes: new Uint8Array([37, 80, 68, 70]) },
        kind: "pdf",
        sourceText: null,
      },
      new Map(),
    );
    expect(choice.status).toBe("ready");
    expect(choice.reasons.map((r) => r.code)).toContain("check_key");
  });

  it("asks for the questions as quoted data, with the rules that keep it extract-only", async () => {
    const { call, requests } = recorded(activityExtraction);
    await extractQuestions(call, questions.slice(0, 2), document(), regions);
    const { request } = requests[0];
    expect(request.system).toMatch(/Never add a mark the source does not have/);
    expect(request.system).toMatch(/Never write one\./);
    expect(Object.keys((request.schema as { properties: object }).properties)).toEqual([
      "question_1",
      "question_2",
    ]);
    const ask = (request.content.at(-1) as { text: string }).text;
    expect(ask).toContain('"opens": "Which food should the nurse suggest first');
    expect(request.content[0]).toMatchObject({ cache_control: { type: "ephemeral" } });
  });
});

describe("regionsOf", () => {
  it("gives each question its part of the text, and nothing for a PDF", () => {
    const questions = activity();
    const regions = regionsOf(questions, COURSE_ACTIVITY);
    expect(regions.get(1)).toMatch(/^Which food[\s\S]*Answer: ✅ B\.\n\n### Question 3\n\n$/);
    expect(regionsOf(questions, null).size).toBe(0);
  });
});
