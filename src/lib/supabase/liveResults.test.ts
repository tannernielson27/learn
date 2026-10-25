import { describe, expect, it, vi } from "vitest";
import { readMyLiveResult, readMyLiveResults, readMyLiveStepMarks } from "./liveResults";

type Client = Parameters<typeof readMyLiveResults>[0];

const SESSION = "00000000-0000-4000-8000-0000000250a1";
const CLASS = "00000000-0000-4000-8000-0000000250c1";
const ITEM_1 = "00000000-0000-4000-8000-000000000001";
const ITEM_2 = "00000000-0000-4000-8000-000000000002";

function fakeRpc(reply: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as Client, rpc };
}

const LIST_ROW = {
  session_id: SESSION,
  title: "Cardiac quiz",
  class_id: CLASS,
  class_name: "NUR 310",
  closed_at: "2026-10-27T15:00:00Z",
  question_count: 2,
  answered: 2,
  points: 2,
  possible: "4.00",
  marks: [
    { position: 1, points: 1, max_points: 1 },
    { position: 2, points: 1, max_points: "3.00" },
    { position: "3", points: 1, max_points: 1 },
    "junk",
  ],
};

describe("readMyLiveResults", () => {
  it("calls the student's own function with no arguments", async () => {
    const fake = fakeRpc({ data: [], error: null });
    await readMyLiveResults(fake.client);
    expect(fake.rpc).toHaveBeenCalledWith("my_live_results");
  });

  it("reads each session, numbers as numbers, and drops a mark that is not well formed", async () => {
    expect(await readMyLiveResults(fakeRpc({ data: [LIST_ROW], error: null }).client)).toEqual([
      {
        sessionId: SESSION,
        title: "Cardiac quiz",
        classId: CLASS,
        className: "NUR 310",
        closedAt: "2026-10-27T15:00:00Z",
        questionCount: 2,
        answered: 2,
        points: 2,
        possible: 4,
        marks: [
          { position: 1, points: 1, maxPoints: 1 },
          { position: 2, points: 1, maxPoints: 3 },
        ],
      },
    ]);
  });

  it("keeps an unanswered question as no points, and a deleted class as no class", async () => {
    const [row] =
      (await readMyLiveResults(
        fakeRpc({
          data: [
            {
              ...LIST_ROW,
              class_id: null,
              class_name: null,
              marks: [{ position: 1, points: null, max_points: 1 }],
            },
          ],
          error: null,
        }).client,
      )) ?? [];
    expect(row?.classId).toBeNull();
    expect(row?.className).toBeNull();
    expect(row?.marks).toEqual([{ position: 1, points: null, maxPoints: 1 }]);
  });

  it("drops a row whose totals are not numbers", async () => {
    expect(
      await readMyLiveResults(
        fakeRpc({ data: [{ ...LIST_ROW, points: "lots" }], error: null }).client,
      ),
    ).toEqual([]);
  });

  it("is null on an error, so the home says the section did not load", async () => {
    expect(await readMyLiveResults(fakeRpc({ data: null, error: { code: "42883" } }).client)).toBe(
      null,
    );
  });
});

const RESULT_ROW = {
  session_id: SESSION,
  title: "Cardiac quiz",
  class_id: CLASS,
  class_name: "NUR 310",
  closed_at: "2026-10-27T15:00:00Z",
  patient_record: null,
  case_study_records: null,
  questions: [
    {
      position: 1,
      item_id: ITEM_1,
      max_points: 1,
      answer: {
        response: { selectedOptionId: "a" },
        points: 1,
        max_points: 1,
        model: "zero_one",
        breakdown: [],
        groups: null,
        reveal: { rationale: "Because." },
      },
    },
    { position: 2, item_id: ITEM_2, max_points: 3, answer: null },
    { position: 3, item_id: "not-a-uuid", max_points: 1, answer: null },
  ],
};

describe("readMyLiveResult", () => {
  it("calls the student's own function with the session only", async () => {
    const fake = fakeRpc({ data: [], error: null });
    await readMyLiveResult(fake.client, SESSION);
    expect(fake.rpc).toHaveBeenCalledWith("my_live_result", { target_session: SESSION });
  });

  it("reads no rows as missing: not ended, not theirs, or no such session", async () => {
    expect(await readMyLiveResult(fakeRpc({ data: [], error: null }).client, SESSION)).toEqual({
      kind: "missing",
    });
  });

  it("is failed on an error", async () => {
    expect(
      await readMyLiveResult(fakeRpc({ data: null, error: { code: "500" } }).client, SESSION),
    ).toEqual({ kind: "failed" });
  });

  it("reads the questions in order with the student's own answer, dropping a malformed one", async () => {
    const read = await readMyLiveResult(
      fakeRpc({ data: [RESULT_ROW], error: null }).client,
      SESSION,
    );
    expect(read).toEqual({
      kind: "found",
      result: {
        sessionId: SESSION,
        title: "Cardiac quiz",
        classId: CLASS,
        className: "NUR 310",
        closedAt: "2026-10-27T15:00:00Z",
        patientRecord: null,
        caseStudyRecords: null,
        questions: [
          {
            position: 1,
            itemId: ITEM_1,
            maxPoints: 1,
            answer: {
              response: { selectedOptionId: "a" },
              points: 1,
              maxPoints: 1,
              model: "zero_one",
              breakdown: [],
              groups: null,
              reveal: { rationale: "Because." },
            },
          },
          { position: 2, itemId: ITEM_2, maxPoints: 3, answer: null },
        ],
      },
    });
  });
});

describe("readMyLiveStepMarks", () => {
  it("reads each live answer's step and two numbers", async () => {
    const fake = fakeRpc({
      data: [
        { cjmm_step: 2, points: 1, max_points: 1 },
        { cjmm_step: null, points: "0.50", max_points: "1.00" },
        { cjmm_step: 4, points: null, max_points: 1 },
      ],
      error: null,
    });
    expect(await readMyLiveStepMarks(fake.client)).toEqual([
      { cjmmStep: 2, points: 1, maxPoints: 1 },
      { cjmmStep: null, points: 0.5, maxPoints: 1 },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith("my_live_step_marks");
  });

  it("is null on an error", async () => {
    expect(await readMyLiveStepMarks(fakeRpc({ data: null, error: { code: "x" } }).client)).toBe(
      null,
    );
  });
});
