import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { buildQuestionStats } from "@/lib/ngn/questionStats";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { revealOf } from "@/lib/ngn/submit";
import {
  QUESTION_ANSWERS_LIMIT,
  questionStatsInput,
  readQuestionAnswers,
  readQuizQuestionMarks,
  toQuestionAnswer,
  toQuestionMark,
  type QuestionAnswerRow,
  type QuizQuestionMarkRow,
} from "./questionStatsReads";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
type Client = Parameters<typeof readQuizQuestionMarks>[0];

const BANK = "00000000-0000-4000-8000-0000000000b1";
const SESSION = "00000000-0000-4000-8000-0000000000e1";
const ASSIGNMENT = "00000000-0000-4000-8000-0000000000f1";

const mc: Item = itemSchema.parse(FIXTURES.multiple_choice.canonical);
const mr: Item = itemSchema.parse(FIXTURES.multiple_response.canonical);

/** The answerKey and scoring the function hands back on a marks row: the reveal without rationale. */
const keyOf = (item: Item) => {
  const { answerKey, scoring } = revealOf(item);
  return { answerKey, scoring };
};

const markRow = (over: Partial<QuizQuestionMarkRow> = {}): QuizQuestionMarkRow => ({
  use_kind: "live",
  use_id: SESSION,
  used_at: "2026-11-20T15:00:00+00:00",
  answerer: "a1",
  item_id: mc.id,
  // numeric over PostgREST is a number, but a driver may hand back a string.
  points: "1.00" as unknown as number,
  max_points: 1,
  scored_key: keyOf(mc),
  ...over,
});

const answerRow = (over: Partial<QuestionAnswerRow> = {}): QuestionAnswerRow => ({
  use_kind: "assignment",
  use_id: ASSIGNMENT,
  used_at: "2026-11-21T15:00:00+00:00",
  answerer: "b1",
  item_id: mc.id,
  points: 0,
  max_points: 1,
  response: { selectedOptionId: "a" },
  reveal: revealOf(mc),
  ...over,
});

/** `rpc(name, args).range(from, to)`, answering from a list of pages and recording each call. */
function fakeRpc(name: string, args: Record<string, string>, pages: Reply[]) {
  const ranges: [number, number][] = [];
  const rpc = vi.fn((called: string, given: unknown) => {
    expect(called).toBe(name);
    expect(given).toEqual(args);
    return {
      range: async (from: number, to: number) => {
        ranges.push([from, to]);
        return pages.shift() ?? { data: [], error: null };
      },
    };
  });
  return { client: { rpc } as unknown as Client, rpc, ranges };
}

describe("toQuestionMark", () => {
  it("maps a marks row to #615's QuestionMark, numbers as numbers and the key as reveal", () => {
    expect(toQuestionMark(markRow())).toEqual({
      useKind: "live",
      useId: SESSION,
      answerer: "a1",
      itemId: mc.id,
      points: 1,
      maxPoints: 1,
      reveal: keyOf(mc),
    });
  });

  it("keeps an assignment row and a row with no stored key", () => {
    expect(toQuestionMark(markRow({ use_kind: "assignment", scored_key: null }))).toMatchObject({
      useKind: "assignment",
      reveal: null,
    });
  });

  it("drops a row whose use it does not understand, or whose numbers are missing", () => {
    expect(toQuestionMark(markRow({ use_kind: "practice" }))).toBeNull();
    expect(toQuestionMark(markRow({ points: null as unknown as number }))).toBeNull();
    expect(toQuestionMark(markRow({ max_points: null as unknown as number }))).toBeNull();
  });
});

describe("toQuestionAnswer", () => {
  it("maps an answers row to #615's QuestionAnswer, with its response and stored reveal", () => {
    expect(toQuestionAnswer(answerRow())).toEqual({
      useKind: "assignment",
      useId: ASSIGNMENT,
      answerer: "b1",
      itemId: mc.id,
      points: 0,
      maxPoints: 1,
      reveal: revealOf(mc),
      response: { selectedOptionId: "a" },
    });
  });

  it("drops a row it does not understand", () => {
    expect(toQuestionAnswer(answerRow({ use_kind: "" }))).toBeNull();
  });
});

describe("questionStatsInput", () => {
  it("builds exactly #615's input: the items, the marks, and answers per question read", () => {
    const input = questionStatsInput({
      items: [mc, mr],
      marks: [markRow(), markRow({ use_kind: "practice" })],
      answers: { [mc.id]: [answerRow()] },
    });
    expect(input.items).toEqual([mc, mr]);
    expect(input.marks).toHaveLength(1);
    expect(input.answers).toEqual({ [mc.id]: [toQuestionAnswer(answerRow())] });
  });

  it("leaves answers out when none were read, so every question is not_read", () => {
    const input = questionStatsInput({ items: [mc], marks: [] });
    expect(input.answers).toBeUndefined();
    expect(buildQuestionStats(input)[0].choices).toEqual({ state: "not_read" });
  });

  it("a question read with no answers is counted at zero, not left unread", () => {
    const stats = buildQuestionStats(
      questionStatsInput({ items: [mc], marks: [], answers: { [mc.id]: [] } }),
    );
    expect(stats[0].choices).toMatchObject({ state: "counted", answers: 0 });
  });

  it("hands each row's stored key to #615, which sets aside an answer scored with an earlier key", () => {
    const earlier = {
      ...keyOf(mc),
      scoring: { ...mc.scoring, maxPoints: mc.scoring.maxPoints + 1 },
    };
    const stats = buildQuestionStats(
      questionStatsInput({
        items: [mc],
        marks: [
          markRow({ answerer: "a1" }),
          markRow({ answerer: "a2", scored_key: null }),
          markRow({ answerer: "a3", scored_key: earlier }),
        ],
      }),
    );
    // a1 has the current key; a2 predates stored keys and counts as current; a3 does not count.
    expect(stats[0]).toMatchObject({ answers: 2, earlierAnswers: 1 });
  });

  it("a rationale is not part of the key: a full reveal row and a key-only row agree", () => {
    const stats = buildQuestionStats(
      questionStatsInput({
        items: [mc],
        marks: [markRow()],
        answers: {
          [mc.id]: [answerRow({ reveal: { ...revealOf(mc), rationale: { general: "reworded" } } })],
        },
      }),
    );
    expect(stats[0]).toMatchObject({ answers: 1, earlierAnswers: 0 });
    expect(stats[0].choices).toMatchObject({ state: "counted", answers: 1, earlierAnswers: 0 });
  });
});

describe("readQuizQuestionMarks", () => {
  it("reads every page as the teacher, in the function's order", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => markRow({ answerer: `a${i}` }));
    const fake = fakeRpc("quiz_question_marks", { target_bank: BANK }, [
      { data: full, error: null },
      { data: [markRow({ answerer: "last" }), markRow({ use_kind: "practice" })], error: null },
    ]);
    const rows = await readQuizQuestionMarks(fake.client, BANK);
    expect(fake.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(rows).toHaveLength(1002);
    // The adapter, not the reader, drops what it does not understand.
    expect(questionStatsInput({ items: [mc], marks: rows }).marks).toHaveLength(1001);
  });

  it("throws when a page fails, so a half-read quiz is never shown as a real one", async () => {
    const fake = fakeRpc("quiz_question_marks", { target_bank: BANK }, [
      { data: null, error: { message: "boom" } },
    ]);
    await expect(readQuizQuestionMarks(fake.client, BANK)).rejects.toThrow(/quiz question marks/);
  });

  it("an empty read is no marks: another workspace's quiz reads like one nobody answered", async () => {
    const fake = fakeRpc("quiz_question_marks", { target_bank: BANK }, [{ data: [], error: null }]);
    await expect(readQuizQuestionMarks(fake.client, BANK)).resolves.toEqual([]);
  });
});

describe("readQuestionAnswers", () => {
  it("reads one question's answers, and never past the function's cap", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => answerRow({ answerer: `b${i}` }));
    const fake = fakeRpc("question_answers", { target_item: mc.id }, [
      { data: page, error: null },
      { data: page, error: null },
      { data: [answerRow({ answerer: "over" })], error: null },
    ]);
    const answers = await readQuestionAnswers(fake.client, mc.id);
    expect(QUESTION_ANSWERS_LIMIT).toBe(2000);
    expect(answers).toHaveLength(QUESTION_ANSWERS_LIMIT);
    expect(fake.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("throws when the read fails", async () => {
    const fake = fakeRpc("question_answers", { target_item: mc.id }, [
      { data: null, error: { message: "nope" } },
    ]);
    await expect(readQuestionAnswers(fake.client, mc.id)).rejects.toThrow(/question answers/);
  });
});
