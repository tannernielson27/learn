import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import {
  beginSubmission,
  listExpiredAttempts,
  listMyAttemptProgress,
  listMyAttempts,
  readSavedAnswers,
  readSetItems,
  readStudentAssignment,
  recordSubmission,
  saveAnswer,
  startAttempt,
} from "./attempts";
import { toItemRow } from "./itemRows";

type Reply = { data?: unknown; error?: { code?: string } | null };
type Client = Parameters<typeof readStudentAssignment>[0];

const A = "00000000-0000-4000-8000-0000000208b1";
const T = "00000000-0000-4000-8000-0000000208a1";
const S = "00000000-0000-4000-8000-0000000208d1";
const F1 = "00000000-0000-4000-8000-0000000208f1";
const F2 = "00000000-0000-4000-8000-0000000208f2";

/** A query builder whose every step returns itself and which resolves to `reply` when awaited. */
function fakeQuery(reply: Reply) {
  const calls: [string, unknown[]][] = [];
  const builder: Record<string, unknown> = {};
  for (const step of ["select", "eq", "in", "order", "maybeSingle"]) {
    builder[step] = (...args: unknown[]) => {
      calls.push([step, args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: Reply) => unknown) => resolve({ error: null, ...reply });
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as Client, from, calls };
}

function fakeRpc(reply: Reply) {
  const rpc = vi.fn(async () => ({ error: null, ...reply }));
  return { client: { rpc } as unknown as Client, rpc };
}

describe("reading as the student", () => {
  it("reads an assignment with its set checked, and null when RLS hides it", async () => {
    const fake = fakeQuery({
      data: {
        id: A,
        class_id: "c",
        title: "Week 5",
        opens_at: "o",
        closes_at: "c",
        max_attempts: 2,
        shuffle_options: true,
        item_set: [F1, 42, "not-a-uuid", F2],
        patient_record: null,
      },
    });
    expect(await readStudentAssignment(fake.client, A)).toMatchObject({
      id: A,
      itemSet: [F1, F2],
      maxAttempts: 2,
    });
    expect(fake.calls.find(([step]) => step === "select")?.[1][0]).not.toContain("score");
    expect(await readStudentAssignment(fakeQuery({ data: null }).client, A)).toBeNull();
    expect(
      await readStudentAssignment(fakeQuery({ data: { item_set: "x" } }).client, A),
    ).toMatchObject({ itemSet: [] });
  });

  it("lists attempts without ever selecting a score", async () => {
    const fake = fakeQuery({
      data: [{ id: T, number: 1, started_at: "s", submitted_at: null, auto_submitted: false }],
    });
    expect(await listMyAttempts(fake.client, A)).toEqual([
      { id: T, number: 1, startedAt: "s", submittedAt: null, autoSubmitted: false },
    ]);
    expect(String(fake.calls.find(([step]) => step === "select")?.[1][0])).not.toMatch(/score/);
    expect(await listMyAttempts(fakeQuery({ error: { code: "x" } }).client, A)).toBeNull();
  });

  it("counts attempts per assignment for the home", async () => {
    const fake = fakeQuery({
      data: [
        { assignment_id: A, submitted_at: "t" },
        { assignment_id: A, submitted_at: null },
        { assignment_id: "b", submitted_at: "t" },
      ],
    });
    const progress = await listMyAttemptProgress(fake.client, [A, "b"]);
    expect(progress?.get(A)).toEqual({ submitted: 1, open: true });
    expect(progress?.get("b")).toEqual({ submitted: 1, open: false });
    expect(await listMyAttemptProgress(fake.client, [])).toEqual(new Map());
    expect(await listMyAttemptProgress(fakeQuery({ data: null }).client, [A])).toBeNull();
  });

  it("reads the saved answers keyed by item", async () => {
    const fake = fakeQuery({ data: [{ item_id: F1, response: { type: "multiple_choice" } }] });
    expect(await readSavedAnswers(fake.client, T)).toEqual({ [F1]: { type: "multiple_choice" } });
    expect(await readSavedAnswers(fakeQuery({ data: null }).client, T)).toBeNull();
  });
});

describe("reading the items as the service role", () => {
  const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
  const MR = itemSchema.parse(FIXTURES.multiple_response.canonical) as Item;

  it("returns them in the set's order and leaves out what is gone or will not parse", async () => {
    const fake = fakeQuery({
      data: [
        { id: F2, ...toItemRow(MR) },
        { id: F1, ...toItemRow(MC) },
        { id: "broken", ...toItemRow(MC), type: "nope" },
      ],
    });
    const set = await readSetItems(fake.client, [F1, "missing", F2, "broken"]);
    expect(set?.map((entry) => [entry.rowId, entry.item.id])).toEqual([
      [F1, MC.id],
      [F2, MR.id],
    ]);
    expect(await readSetItems(fake.client, [])).toEqual([]);
    expect(await readSetItems(fakeQuery({ error: { code: "x" } }).client, [F1])).toBeNull();
  });
});

describe("the attempt functions", () => {
  it("starts an attempt, or says why not", async () => {
    const ok = fakeRpc({ data: [{ refusal: null, attempt_id: T }] });
    expect(await startAttempt(ok.client, A)).toEqual({ ok: true, value: T });
    expect(ok.rpc).toHaveBeenCalledWith("start_assignment_attempt", { target_assignment: A });
    expect(
      await startAttempt(fakeRpc({ data: [{ refusal: "no_attempts_left" }] }).client, A),
    ).toEqual({ ok: false, refusal: "no_attempts_left" });
    expect(await startAttempt(fakeRpc({ error: { code: "42501" } }).client, A)).toEqual({
      ok: false,
      refusal: "signed_out",
    });
    expect(await startAttempt(fakeRpc({ data: [] }).client, A)).toEqual({
      ok: false,
      refusal: "failed",
    });
  });

  it("saves an answer", async () => {
    const ok = fakeRpc({ data: [{ refusal: null, saved_at: "t" }] });
    expect(await saveAnswer(ok.client, T, F1, { type: "multiple_choice" })).toEqual({
      ok: true,
      value: "t",
    });
    expect(await saveAnswer(fakeRpc({ error: { code: "x" } }).client, T, F1, {})).toEqual({
      ok: false,
      refusal: "failed",
    });
  });

  it("begins a submission with the set, the revision and the answers", async () => {
    const ok = fakeRpc({
      data: [{ refusal: null, item_set: [F1], revision: 4, answers: { [F1]: { a: 1 } } }],
    });
    expect(await beginSubmission(ok.client, T)).toEqual({
      ok: true,
      value: { itemSet: [F1], revision: 4, answers: { [F1]: { a: 1 } } },
    });
    expect(await beginSubmission(fakeRpc({ data: [{ refusal: "closed" }] }).client, T)).toEqual({
      ok: false,
      refusal: "closed",
    });
    expect(
      await beginSubmission(fakeRpc({ data: [{ refusal: null, revision: null }] }).client, T),
    ).toEqual({ ok: false, refusal: "failed" });
    expect(
      await beginSubmission(
        fakeRpc({ data: [{ refusal: null, item_set: null, revision: 0, answers: [] }] }).client,
        T,
      ),
    ).toEqual({ ok: true, value: { itemSet: [], revision: 0, answers: {} } });
    expect(await beginSubmission(fakeRpc({ error: { code: "42501" } }).client, T)).toEqual({
      ok: false,
      refusal: "signed_out",
    });
  });

  it("records a score as the service role", async () => {
    const ok = fakeRpc({ data: [{ refusal: null, submitted_at: "t" }] });
    const input = {
      attemptId: T,
      studentId: S,
      revision: 2,
      score: { total: 1, possible: 2, marks: [] },
      automatic: true,
    };
    expect(await recordSubmission(ok.client, input)).toEqual({ ok: true, value: "t" });
    expect(ok.rpc).toHaveBeenCalledWith("record_attempt_submission", {
      target_attempt: T,
      student: S,
      expected_revision: 2,
      total: 1,
      possible: 2,
      marks: [],
      automatic: true,
    });
    expect(
      await recordSubmission(fakeRpc({ data: [{ refusal: "changed" }] }).client, input),
    ).toEqual({ ok: false, refusal: "changed" });
    expect(await recordSubmission(fakeRpc({ error: { code: "x" } }).client, input)).toEqual({
      ok: false,
      refusal: "failed",
    });
    expect(await recordSubmission(fakeRpc({ data: [{ refusal: null }] }).client, input)).toEqual({
      ok: false,
      refusal: "failed",
    });
  });

  it("lists what is due at close, narrowed when asked", async () => {
    const fake = fakeRpc({
      data: [
        {
          attempt_id: T,
          student_id: S,
          assignment_id: A,
          item_set: [F1],
          revision: 1,
          answers: {},
        },
      ],
    });
    expect(
      await listExpiredAttempts(fake.client, { assignmentId: A, studentId: S, limit: 5 }),
    ).toEqual([
      { attemptId: T, studentId: S, assignmentId: A, itemSet: [F1], revision: 1, answers: {} },
    ]);
    expect(fake.rpc).toHaveBeenCalledWith("expired_open_attempts", {
      target_assignment: A,
      target_student: S,
      max_rows: 5,
    });
    await listExpiredAttempts(fake.client, {});
    expect(fake.rpc).toHaveBeenLastCalledWith("expired_open_attempts", {});
    expect(await listExpiredAttempts(fakeRpc({ error: { code: "x" } }).client, {})).toBeNull();
  });
});
