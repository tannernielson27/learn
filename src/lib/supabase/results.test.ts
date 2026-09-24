import { describe, expect, it, vi } from "vitest";
import { readMyResult } from "./results";

type Client = Parameters<typeof readMyResult>[0];

const ASSIGNMENT = "00000000-0000-4000-8000-0000000210b1";
const ITEM_1 = "00000000-0000-4000-8000-000000000001";
const ITEM_2 = "00000000-0000-4000-8000-000000000002";
const ATTEMPT_1 = "00000000-0000-4000-8000-0000000210a1";
const ATTEMPT_2 = "00000000-0000-4000-8000-0000000210a2";

function fakeRpc(reply: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as Client, rpc };
}

const HEADER = {
  assignment_id: ASSIGNMENT,
  title: "NUR 310 — Week 5",
  closes_at: "2026-09-23T12:00:00Z",
  max_attempts: 2,
  item_set: [ITEM_1, ITEM_2, "not-a-uuid"],
  patient_record: null,
};

const EMPTY_ATTEMPT = {
  attempt_id: null,
  attempt_number: null,
  started_at: null,
  submitted_at: null,
  auto_submitted: false,
  score: null,
  max_score: null,
  marks: null,
};

describe("readMyResult", () => {
  it("calls the student's own function with the assignment only", async () => {
    const fake = fakeRpc({ data: [], error: null });
    await readMyResult(fake.client, ASSIGNMENT);
    expect(fake.rpc).toHaveBeenCalledWith("my_assignment_result", {
      target_assignment: ASSIGNMENT,
    });
  });

  it("reads no rows as withheld: not closed yet, or not this student's", async () => {
    expect(await readMyResult(fakeRpc({ data: [], error: null }).client, ASSIGNMENT)).toEqual({
      kind: "withheld",
    });
  });

  it("reads an error as failed", async () => {
    expect(
      await readMyResult(fakeRpc({ data: null, error: { code: "x" } }).client, ASSIGNMENT),
    ).toEqual({ kind: "failed" });
  });

  it("reads a student who made no attempt as the assignment with no attempts", async () => {
    const read = await readMyResult(
      fakeRpc({ data: [{ ...HEADER, ...EMPTY_ATTEMPT }], error: null }).client,
      ASSIGNMENT,
    );
    expect(read).toEqual({
      kind: "released",
      result: {
        assignmentId: ASSIGNMENT,
        title: HEADER.title,
        closesAt: HEADER.closes_at,
        maxAttempts: 2,
        itemSet: [ITEM_1, ITEM_2],
        patientRecord: null,
        attempts: [],
      },
    });
  });

  it("reads each attempt with its score and marks, and an open one with neither", async () => {
    const read = await readMyResult(
      fakeRpc({
        data: [
          {
            ...HEADER,
            attempt_id: ATTEMPT_1,
            attempt_number: 1,
            started_at: "2026-09-23T10:00:00Z",
            submitted_at: "2026-09-23T11:00:00Z",
            auto_submitted: false,
            score: "1.50",
            max_score: 2,
            marks: [
              {
                item_id: ITEM_1,
                response: { type: "multiple_choice", optionId: "opt_b" },
                points: 1,
                max_points: 1,
                model: "zero_one",
                breakdown: [],
                groups: null,
              },
              { item_id: "junk" },
              "not an object",
            ],
          },
          {
            ...HEADER,
            attempt_id: ATTEMPT_2,
            attempt_number: 2,
            started_at: "2026-09-23T11:10:00Z",
            submitted_at: null,
            auto_submitted: false,
            score: 2,
            max_score: 2,
            marks: [],
          },
        ],
        error: null,
      }).client,
      ASSIGNMENT,
    );
    if (read.kind !== "released") throw new Error(read.kind);
    expect(read.result.attempts).toEqual([
      {
        id: ATTEMPT_1,
        number: 1,
        submittedAt: "2026-09-23T11:00:00Z",
        autoSubmitted: false,
        score: 1.5,
        maxScore: 2,
        marks: [
          {
            itemId: ITEM_1,
            response: { type: "multiple_choice", optionId: "opt_b" },
            points: 1,
            maxPoints: 1,
            model: "zero_one",
            breakdown: [],
            groups: null,
          },
        ],
      },
      {
        id: ATTEMPT_2,
        number: 2,
        submittedAt: null,
        autoSubmitted: false,
        score: null,
        maxScore: null,
        marks: null,
      },
    ]);
  });

  it("reads marks that are not a list as none", async () => {
    const read = await readMyResult(
      fakeRpc({
        data: [
          {
            ...HEADER,
            ...EMPTY_ATTEMPT,
            attempt_id: ATTEMPT_1,
            attempt_number: 1,
            submitted_at: "2026-09-23T11:00:00Z",
            score: null,
            marks: { nope: true },
          },
        ],
        error: null,
      }).client,
      ASSIGNMENT,
    );
    if (read.kind !== "released") throw new Error(read.kind);
    expect(read.result.attempts[0]).toMatchObject({ score: null, marks: null });
    expect(read.result.itemSet).toEqual([ITEM_1, ITEM_2]);
  });
});
