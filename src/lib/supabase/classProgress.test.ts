import { describe, expect, it, vi } from "vitest";
import { listClassSessions, readClassProgress } from "./classProgress";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
type Client = Parameters<typeof readClassProgress>[0];

const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const STUDENT = "00000000-0000-4000-8000-0000000000d1";
const SESSION = "00000000-0000-4000-8000-0000000000e1";

const progressRow = (over: Record<string, unknown> = {}) => ({
  profile_id: STUDENT,
  display_name: "Mia Chen",
  email: "mia@example.test",
  membership: "member",
  activity_kind: "session",
  activity_id: SESSION,
  title: "Cardiac",
  occurred_at: "2026-10-13T15:00:00Z",
  activity_state: "ended",
  attended: true,
  status: null,
  attempts_used: null,
  attempt_number: null,
  points: "1.50",
  possible: 2,
  percent: "75.00",
  ...over,
});

/** `rpc(name).range(from, to)`, answering each function from its own list of pages. */
function fakeRpc(pages: Record<string, Reply[]>) {
  const ranges: [string, number, number][] = [];
  const rpc = vi.fn((name: string, args: unknown) => {
    expect(args).toEqual({ target_class: CLASS_ID });
    return {
      range: async (from: number, to: number) => {
        ranges.push([name, from, to]);
        return pages[name]?.shift() ?? { data: [], error: null };
      },
    };
  });
  return { client: { rpc } as unknown as Client, rpc, ranges };
}

describe("readClassProgress", () => {
  it("reads both functions as the teacher and maps their rows", async () => {
    const fake = fakeRpc({
      class_progress: [
        {
          data: [
            progressRow(),
            progressRow({
              display_name: "  ",
              membership: "removed",
              activity_kind: "assignment",
              status: "submitted",
              attempts_used: 2,
              attempt_number: 1,
              percent: null,
              points: null,
              possible: null,
            }),
          ],
          error: null,
        },
      ],
      class_progress_steps: [
        {
          data: [
            {
              profile_id: STUDENT,
              step: 2,
              answered: 3,
              points: 2,
              possible: 3,
              mean_percent: "66.67",
            },
          ],
          error: null,
        },
      ],
    });
    const read = await readClassProgress(fake.client, CLASS_ID);
    expect(read.rows[0]).toEqual({
      profileId: STUDENT,
      name: "Mia Chen",
      email: "mia@example.test",
      membership: "member",
      kind: "session",
      activityId: SESSION,
      title: "Cardiac",
      occurredAt: "2026-10-13T15:00:00Z",
      state: "ended",
      attended: true,
      status: null,
      attemptsUsed: null,
      attemptNumber: null,
      points: 1.5,
      possible: 2,
      percent: 75,
    });
    // A blank display name is the address, as on the roster.
    expect(read.rows[1]).toMatchObject({
      name: "mia@example.test",
      membership: "removed",
      kind: "assignment",
      status: "submitted",
      percent: null,
    });
    expect(read.steps).toEqual([{ profileId: STUDENT, step: 2, answered: 3, meanPercent: 66.67 }]);
  });

  it("drops a row it does not understand rather than guessing", async () => {
    const fake = fakeRpc({
      class_progress: [
        {
          data: [progressRow({ activity_kind: "practice" }), progressRow({ status: "graded" })],
          error: null,
        },
      ],
      class_progress_steps: [
        {
          data: [
            { profile_id: STUDENT, step: 9, answered: 1, points: 1, possible: 1, mean_percent: 1 },
          ],
          error: null,
        },
      ],
    });
    const read = await readClassProgress(fake.client, CLASS_ID);
    expect(read.rows).toHaveLength(1);
    expect(read.rows[0]?.status).toBeNull();
    expect(read.steps).toEqual([]);
  });

  it("reads a page at a time until one comes back short", async () => {
    const full = Array.from({ length: 1000 }, () => progressRow());
    const fake = fakeRpc({
      class_progress: [
        { data: full, error: null },
        { data: [progressRow()], error: null },
      ],
    });
    const read = await readClassProgress(fake.client, CLASS_ID);
    expect(read.rows).toHaveLength(1001);
    expect(fake.ranges.filter(([name]) => name === "class_progress")).toEqual([
      ["class_progress", 0, 999],
      ["class_progress", 1000, 1999],
    ]);
  });

  it("throws when a read fails, so a half-read class is never shown", async () => {
    const fake = fakeRpc({
      class_progress: [{ data: null, error: { message: "boom" } }],
    });
    await expect(readClassProgress(fake.client, CLASS_ID)).rejects.toThrow(
      "could not read class progress: boom",
    );
  });
});

describe("listClassSessions", () => {
  function fakeQuery(reply: Reply) {
    const calls: [string, unknown[]][] = [];
    const builder: Record<string, unknown> = {};
    for (const step of ["select", "eq", "order", "limit"]) {
      builder[step] = (...args: unknown[]) => {
        calls.push([step, args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: Reply) => unknown) => resolve(reply);
    const from = vi.fn(() => builder);
    return { client: { from } as unknown as Client, from, calls };
  }

  it("lists the class's own live sessions, newest first, with how many joined", async () => {
    const fake = fakeQuery({
      data: [
        {
          id: SESSION,
          title: "Cardiac",
          status: "ended",
          opened_at: "2026-10-13T15:00:00Z",
          closed_at: "2026-10-13T15:50:00Z",
          participants: [{ id: "p1" }, { id: "p2" }],
        },
      ],
      error: null,
    });
    expect(await listClassSessions(fake.client, CLASS_ID)).toEqual([
      {
        id: SESSION,
        title: "Cardiac",
        status: "ended",
        openedAt: "2026-10-13T15:00:00Z",
        closedAt: "2026-10-13T15:50:00Z",
        participantCount: 2,
      },
    ]);
    expect(fake.from).toHaveBeenCalledWith("sessions");
    expect(fake.calls).toContainEqual(["eq", ["class_id", CLASS_ID]]);
    expect(fake.calls).toContainEqual(["order", ["opened_at", { ascending: false }]]);
    // Who joined is counted, never named: no profile link is read here.
    const selected = String(fake.calls.find(([step]) => step === "select")?.[1][0]);
    expect(selected).not.toContain("profile_id");
  });

  it("is null when the list cannot be read", async () => {
    expect(
      await listClassSessions(fakeQuery({ data: null, error: { message: "x" } }).client, CLASS_ID),
    ).toBeNull();
  });
});
