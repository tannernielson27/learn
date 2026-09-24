import { describe, expect, it, vi } from "vitest";
import { readMyHistory } from "./history";

type Client = Parameters<typeof readMyHistory>[0];

const CLASS = "00000000-0000-4000-8000-0000000238c1";
const WEEK_1 = "00000000-0000-4000-8000-0000000238b1";
const WEEK_2 = "00000000-0000-4000-8000-0000000238b2";

function fakeRpc(reply: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as Client, rpc };
}

const header = (id: string, title: string, closesAt: string) => ({
  assignment_id: id,
  class_id: CLASS,
  title,
  closes_at: closesAt,
  max_attempts: 2,
});

const NO_ATTEMPT = {
  attempt_id: null,
  attempt_number: null,
  submitted_at: null,
  score: null,
  max_score: null,
};

describe("readMyHistory (#238)", () => {
  it("calls the student's own function, with no arguments", async () => {
    const fake = fakeRpc({ data: [], error: null });
    expect(await readMyHistory(fake.client)).toEqual([]);
    expect(fake.rpc).toHaveBeenCalledWith("my_assignment_history");
  });

  it("reads an error, or no array, as null", async () => {
    expect(await readMyHistory(fakeRpc({ data: null, error: { code: "x" } }).client)).toBeNull();
    expect(await readMyHistory(fakeRpc({ data: {}, error: null }).client)).toBeNull();
  });

  it("groups the rows by assignment, in the order the database gave", async () => {
    const rows = [
      { ...header(WEEK_2, "Week 2", "2026-09-23T12:00:00Z"), ...NO_ATTEMPT },
      {
        ...header(WEEK_1, "Week 1", "2026-09-22T12:00:00Z"),
        attempt_id: "a1",
        attempt_number: 1,
        submitted_at: "2026-09-22T11:00:00Z",
        score: 1.5,
        max_score: "2.00",
      },
      {
        ...header(WEEK_1, "Week 1", "2026-09-22T12:00:00Z"),
        attempt_id: "a2",
        attempt_number: 2,
        submitted_at: null,
        score: 2,
        max_score: 2,
      },
    ];
    expect(await readMyHistory(fakeRpc({ data: rows, error: null }).client)).toEqual([
      {
        id: WEEK_2,
        classId: CLASS,
        title: "Week 2",
        closesAt: "2026-09-23T12:00:00Z",
        maxAttempts: 2,
        attempts: [],
      },
      {
        id: WEEK_1,
        classId: CLASS,
        title: "Week 1",
        closesAt: "2026-09-22T12:00:00Z",
        maxAttempts: 2,
        attempts: [
          { id: "a1", number: 1, submittedAt: "2026-09-22T11:00:00Z", score: 1.5, maxScore: 2 },
          // An open attempt never carries a score, whatever a row says.
          { id: "a2", number: 2, submittedAt: null, score: null, maxScore: null },
        ],
      },
    ]);
  });

  it("reads a score that is not a number as none", async () => {
    const rows = [
      {
        ...header(WEEK_1, "Week 1", "2026-09-22T12:00:00Z"),
        attempt_id: "a1",
        attempt_number: 1,
        submitted_at: "2026-09-22T11:00:00Z",
        score: "lots",
        max_score: null,
      },
    ];
    const [entry] = (await readMyHistory(fakeRpc({ data: rows, error: null }).client)) ?? [];
    expect(entry?.attempts).toEqual([
      { id: "a1", number: 1, submittedAt: "2026-09-22T11:00:00Z", score: null, maxScore: null },
    ]);
  });
});
