import { describe, expect, it, vi } from "vitest";
import {
  createAssignment,
  deleteAssignment,
  listClassAssignments,
  listOpenAssignments,
  updateAssignmentCloseTime,
  updateAssignmentWindow,
} from "./assignments";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
type Client = Parameters<typeof listClassAssignments>[0];

const CLASS_ID = "00000000-0000-4000-8000-0000000000c1";
const ASSIGNMENT_ID = "00000000-0000-4000-8000-0000000000a1";
const BANK_ID = "00000000-0000-4000-8000-0000000000b1";

/** A query builder whose every step returns itself and which resolves to `reply` when awaited. */
function fakeQuery(reply: Reply) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const step of [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "gt",
    "lte",
    "order",
    "limit",
  ]) {
    builder[step] = (...args: unknown[]) => {
      calls.push([step, args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: Reply) => unknown) => resolve(reply);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as Client, from, calls };
}

const INPUT = {
  classId: CLASS_ID,
  opensAt: "2026-09-23T15:00:00.000Z",
  closesAt: "2026-09-24T23:00:00.000Z",
  maxAttempts: 2,
  shuffleOptions: false,
};

const ROW = {
  id: ASSIGNMENT_ID,
  class_id: CLASS_ID,
  title: "Cardiac bank",
  opens_at: INPUT.opensAt,
  closes_at: INPUT.closesAt,
  max_attempts: 2,
  shuffle_options: false,
};

const SUMMARY = {
  id: ASSIGNMENT_ID,
  classId: CLASS_ID,
  title: "Cardiac bank",
  opensAt: INPUT.opensAt,
  closesAt: INPUT.closesAt,
  maxAttempts: 2,
  shuffleOptions: false,
};

describe("createAssignment", () => {
  it("inserts the class, the source and the window, and leaves the snapshot to the database", async () => {
    const fake = fakeQuery({ error: null });
    expect(await createAssignment(fake.client, { kind: "bank", id: BANK_ID }, INPUT)).toEqual({
      ok: true,
    });
    expect(fake.from).toHaveBeenCalledWith("assignments");
    const inserted = fake.calls.find(([step]) => step === "insert")?.[1][0];
    expect(inserted).toEqual({
      class_id: CLASS_ID,
      bank_id: BANK_ID,
      case_study_id: null,
      title: "",
      opens_at: INPUT.opensAt,
      closes_at: INPUT.closesAt,
      max_attempts: 2,
      shuffle_options: false,
    });
    expect(inserted).not.toHaveProperty("item_set");
  });

  it("points a case study assignment at the case study", async () => {
    const fake = fakeQuery({ error: null });
    await createAssignment(fake.client, { kind: "case_study", id: BANK_ID }, INPUT);
    const inserted = fake.calls.find(([step]) => step === "insert")?.[1][0];
    expect(inserted).toMatchObject({ bank_id: null, case_study_id: BANK_ID });
  });

  it.each([
    ["22023", "unavailable"],
    ["P0002", "gone"],
    ["23503", "gone"],
    ["23514", "invalid"],
    ["54000", "rate_limited"],
    ["42501", "failed"],
  ])("reads database error %s as %s", async (code, reason) => {
    const fake = fakeQuery({ error: { code } });
    expect(await createAssignment(fake.client, { kind: "bank", id: BANK_ID }, INPUT)).toEqual({
      ok: false,
      reason,
    });
  });
});

describe("listing", () => {
  it("lists one class's assignments without their item set", async () => {
    const fake = fakeQuery({ data: [ROW], error: null });
    expect(await listClassAssignments(fake.client, CLASS_ID)).toEqual([SUMMARY]);
    expect(fake.calls).toContainEqual(["eq", ["class_id", CLASS_ID]]);
    const selected = fake.calls.find(([step]) => step === "select")?.[1][0];
    expect(selected).not.toContain("item_set");
    expect(selected).not.toContain("patient_record");
  });

  it("returns null when a class's list cannot be read", async () => {
    expect(
      await listClassAssignments(fakeQuery({ error: { code: "x" } }).client, CLASS_ID),
    ).toBeNull();
  });

  it("lists a student's assignments that have not closed", async () => {
    const now = new Date("2026-09-23T16:00:00.000Z");
    const fake = fakeQuery({ data: [ROW], error: null });
    expect(await listOpenAssignments(fake.client, now)).toEqual([SUMMARY]);
    expect(fake.calls).toContainEqual(["gt", ["closes_at", now.toISOString()]]);
  });

  it("returns null when a student's list cannot be read", async () => {
    const fake = fakeQuery({ data: null, error: { code: "x" } });
    expect(await listOpenAssignments(fake.client, new Date())).toBeNull();
  });
});

describe("editing", () => {
  it("changes the window, the attempts and shuffling before it opens", async () => {
    const fake = fakeQuery({ data: [{ id: ASSIGNMENT_ID }], error: null });
    const edit = {
      opensAt: INPUT.opensAt,
      closesAt: INPUT.closesAt,
      maxAttempts: INPUT.maxAttempts,
      shuffleOptions: INPUT.shuffleOptions,
    };
    expect(await updateAssignmentWindow(fake.client, ASSIGNMENT_ID, edit)).toEqual({ ok: true });
    expect(fake.calls.find(([step]) => step === "update")?.[1][0]).toEqual({
      opens_at: INPUT.opensAt,
      closes_at: INPUT.closesAt,
      max_attempts: 2,
      shuffle_options: false,
    });
  });

  it("sends only the close time after it opens", async () => {
    const fake = fakeQuery({ data: [{ id: ASSIGNMENT_ID }], error: null });
    await updateAssignmentCloseTime(fake.client, ASSIGNMENT_ID, INPUT.closesAt);
    const patch = fake.calls.find(([step]) => step === "update")?.[1][0];
    expect(JSON.parse(JSON.stringify(patch))).toEqual({ closes_at: INPUT.closesAt });
  });

  it("says gone when no row changed", async () => {
    const fake = fakeQuery({ data: [], error: null });
    expect(await updateAssignmentCloseTime(fake.client, ASSIGNMENT_ID, INPUT.closesAt)).toEqual({
      ok: false,
      reason: "gone",
    });
  });

  it("passes the database's refusal on", async () => {
    const fake = fakeQuery({ data: null, error: { code: "22023" } });
    expect(await updateAssignmentCloseTime(fake.client, ASSIGNMENT_ID, INPUT.closesAt)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});

describe("deleteAssignment", () => {
  it("is true when a row went", async () => {
    const fake = fakeQuery({ data: [{ id: ASSIGNMENT_ID }], error: null });
    expect(await deleteAssignment(fake.client, ASSIGNMENT_ID)).toBe(true);
  });

  it("is false when nothing went: it has opened, or it is gone", async () => {
    expect(await deleteAssignment(fakeQuery({ data: [], error: null }).client, ASSIGNMENT_ID)).toBe(
      false,
    );
  });
});
