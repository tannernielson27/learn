import { describe, expect, it, vi } from "vitest";
import { readMyStepAttempts } from "./steps";

type Client = Parameters<typeof readMyStepAttempts>[0];

const WEEK_1 = "00000000-0000-4000-8000-0000000239b1";

function fakeRpc(reply: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as Client, rpc };
}

const row = (marks: unknown, overrides: Record<string, unknown> = {}) => ({
  assignment_id: WEEK_1,
  attempt_number: 1,
  submitted_at: "2026-09-22T11:00:00Z",
  score: 3,
  max_score: 4,
  marks,
  ...overrides,
});

describe("readMyStepAttempts (#239)", () => {
  it("calls the student's own function, with no arguments", async () => {
    const fake = fakeRpc({ data: [], error: null });
    expect(await readMyStepAttempts(fake.client)).toEqual([]);
    expect(fake.rpc).toHaveBeenCalledWith("my_step_marks");
  });

  it("reads an error, or no array, as null", async () => {
    expect(
      await readMyStepAttempts(fakeRpc({ data: null, error: { code: "x" } }).client),
    ).toBeNull();
    expect(await readMyStepAttempts(fakeRpc({ data: {}, error: null }).client)).toBeNull();
  });

  it("turns each row into an attempt with its marks and their steps", async () => {
    const data = [
      row([
        { cjmm_step: 1, points: 1, max_points: 2 },
        { cjmm_step: null, points: "0.5", max_points: "1" },
      ]),
    ];
    expect(await readMyStepAttempts(fakeRpc({ data, error: null }).client)).toEqual([
      {
        assignmentId: WEEK_1,
        number: 1,
        submittedAt: "2026-09-22T11:00:00Z",
        score: 3,
        maxScore: 4,
        marks: [
          { cjmmStep: 1, points: 1, maxPoints: 2 },
          { cjmmStep: null, points: 0.5, maxPoints: 1 },
        ],
      },
    ]);
  });

  it("leaves out a mark that is not well formed, and reads a step that is not a number as none", async () => {
    const data = [
      row([
        null,
        [],
        "x",
        { cjmm_step: 2, points: null, max_points: 1 },
        { cjmm_step: 2, points: 1, max_points: "lots" },
        { cjmm_step: "2", points: 1, max_points: 1 },
      ]),
      row("not an array", { attempt_number: 2 }),
    ];
    const [first, second] = (await readMyStepAttempts(fakeRpc({ data, error: null }).client)) ?? [];
    expect(first?.marks).toEqual([{ cjmmStep: null, points: 1, maxPoints: 1 }]);
    expect(second?.marks).toEqual([]);
  });

  it("reads a total that is not a number as none", async () => {
    const data = [row([], { score: null, max_score: "x", submitted_at: null })];
    const [attempt] = (await readMyStepAttempts(fakeRpc({ data, error: null }).client)) ?? [];
    expect(attempt).toMatchObject({ score: null, maxScore: null, submittedAt: null });
  });
});
