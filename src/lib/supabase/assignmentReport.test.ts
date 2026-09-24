import { describe, expect, it } from "vitest";
import { readAssignmentReportRows, readReportAssignment } from "./assignmentReport";
import { PAGE_SIZE } from "./sessionReport";

type Client = Parameters<typeof readReportAssignment>[0];
type Reply = { data: unknown; error: { message: string } | null };
type Call = { name: string; method: string; args: unknown[] };

/** Records every call; a `range` slices an array reply, so paging is exercised. */
function fakeClient(replies: Record<string, Reply>) {
  const calls: Call[] = [];
  const chainFor = (name: string, first: Call) => {
    calls.push(first);
    let range: [number, number] | null = null;
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "order", "range", "maybeSingle"]) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ name, method, args });
        if (method === "range") range = [args[0] as number, args[1] as number];
        return chain;
      };
    }
    chain.then = (resolve: (value: Reply) => unknown) => {
      const base = replies[name] ?? { data: null, error: { message: `no reply for ${name}` } };
      resolve(
        range && Array.isArray(base.data)
          ? { ...base, data: base.data.slice(range[0], range[1] + 1) }
          : base,
      );
    };
    return chain;
  };
  const client = {
    from: (table: string) => chainFor(table, { name: table, method: "from", args: [] }),
    rpc: (fn: string, args: unknown) => chainFor(fn, { name: fn, method: "rpc", args: [args] }),
  };
  return { client: client as unknown as Client, calls };
}

const ASSIGNMENT = "00000000-0000-4000-8000-0000000002a1";
const ITEM_A = "00000000-0000-4000-8000-00000000021a";

const assignmentRow = {
  id: ASSIGNMENT,
  class_id: "00000000-0000-4000-8000-0000000002c1",
  title: "Week 5",
  opens_at: "2026-09-21T09:00:00Z",
  closes_at: "2026-09-23T17:00:00Z",
  max_attempts: 2,
  item_set: [ITEM_A, 42],
};

const row = (overrides: Record<string, unknown>) => ({
  student_id: "s-ava",
  display_name: "Ava",
  email: "ava@example.test",
  attempt_id: null,
  attempt_number: null,
  started_at: null,
  submitted_at: null,
  auto_submitted: false,
  scores_released: true,
  score: null,
  max_score: null,
  marks: null,
  ...overrides,
});

describe("readReportAssignment", () => {
  it("reads the assignment as the author, set checked", async () => {
    const fake = fakeClient({ assignments: { data: assignmentRow, error: null } });
    expect(await readReportAssignment(fake.client, ASSIGNMENT)).toEqual({
      id: ASSIGNMENT,
      classId: assignmentRow.class_id,
      title: "Week 5",
      opensAt: assignmentRow.opens_at,
      closesAt: assignmentRow.closes_at,
      maxAttempts: 2,
      itemSet: [ITEM_A],
    });
    expect(fake.calls).toContainEqual({
      name: "assignments",
      method: "eq",
      args: ["id", ASSIGNMENT],
    });
  });

  it("reads one it cannot see as not there", async () => {
    const fake = fakeClient({ assignments: { data: null, error: null } });
    expect(await readReportAssignment(fake.client, ASSIGNMENT)).toBeNull();
  });

  it("reads a set that is not a list as empty", async () => {
    const fake = fakeClient({
      assignments: { data: { ...assignmentRow, item_set: { not: "a list" } }, error: null },
    });
    expect((await readReportAssignment(fake.client, ASSIGNMENT))?.itemSet).toEqual([]);
  });

  it("throws when the read fails", async () => {
    const fake = fakeClient({ assignments: { data: null, error: { message: "down" } } });
    await expect(readReportAssignment(fake.client, ASSIGNMENT)).rejects.toThrow(/down/);
  });
});

describe("readAssignmentReportRows", () => {
  it("turns the rows into students and attempts, with marks and scores as numbers", async () => {
    const fake = fakeClient({
      assignment_report_rows: {
        data: [
          row({
            attempt_id: "ava-1",
            attempt_number: 1,
            submitted_at: "2026-09-23T10:00:00Z",
            score: "2.50",
            max_score: 3,
            marks: [
              { item_id: ITEM_A, points: 1.5, max_points: 2 },
              { item_id: 7, points: 1, max_points: 1 },
              "junk",
            ],
          }),
          row({ attempt_id: "ava-2", attempt_number: 2 }),
          row({ student_id: "s-hal", display_name: null, email: "hal@example.test" }),
          row({ student_id: "s-kim", display_name: "   ", email: "kim@example.test" }),
        ],
        error: null,
      },
    });
    const read = await readAssignmentReportRows(fake.client, ASSIGNMENT);
    expect(read.released).toBe(true);
    expect(read.students).toEqual([
      { id: "s-ava", displayName: "Ava" },
      { id: "s-hal", displayName: "hal@example.test" },
      { id: "s-kim", displayName: "kim@example.test" },
    ]);
    expect(read.attempts).toEqual([
      {
        studentId: "s-ava",
        id: "ava-1",
        number: 1,
        submittedAt: "2026-09-23T10:00:00Z",
        score: 2.5,
        maxScore: 3,
        marks: [{ itemId: ITEM_A, points: 1.5, maxPoints: 2 }],
      },
      {
        studentId: "s-ava",
        id: "ava-2",
        number: 2,
        submittedAt: null,
        score: null,
        maxScore: null,
        marks: null,
      },
    ]);
    expect(fake.calls[0]).toEqual({
      name: "assignment_report_rows",
      method: "rpc",
      args: [{ target_assignment: ASSIGNMENT }],
    });
  });

  it("is not released when the rows say so, or when there are none", async () => {
    const open = fakeClient({
      assignment_report_rows: { data: [row({ scores_released: false })], error: null },
    });
    expect((await readAssignmentReportRows(open.client, ASSIGNMENT)).released).toBe(false);
    const empty = fakeClient({ assignment_report_rows: { data: [], error: null } });
    expect(await readAssignmentReportRows(empty.client, ASSIGNMENT)).toEqual({
      released: false,
      students: [],
      attempts: [],
    });
  });

  it("pages past PostgREST's row limit", async () => {
    const many = Array.from({ length: PAGE_SIZE + 3 }, (_, index) =>
      row({ student_id: `s-${String(index).padStart(5, "0")}` }),
    );
    const fake = fakeClient({ assignment_report_rows: { data: many, error: null } });
    const read = await readAssignmentReportRows(fake.client, ASSIGNMENT);
    expect(read.students).toHaveLength(PAGE_SIZE + 3);
    expect(fake.calls.filter((call) => call.method === "range")).toHaveLength(2);
  });

  it("throws when the read fails", async () => {
    const fake = fakeClient({ assignment_report_rows: { data: null, error: { message: "down" } } });
    await expect(readAssignmentReportRows(fake.client, ASSIGNMENT)).rejects.toThrow(/down/);
  });
});
