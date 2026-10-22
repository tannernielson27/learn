import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";
import {
  readMissedRun,
  readRunMarks,
  startMissedFromAssignment,
  startMissedFromRun,
} from "./practiceMissed";

type Reply = { data: unknown; error: unknown };

function rpcClient(reply: Reply) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

const STUDENT = "00000000-0000-4000-8000-0000000479d1";
const RUN = "00000000-0000-4000-8000-0000000479a1";
const ASSIGNMENT = "00000000-0000-4000-8000-0000000479b1";
const ITEMS = ["00000000-0000-4000-8000-0000000479f1"];

describe("startMissedFromRun", () => {
  it("names the student, the source and the questions, and reads the new run back", async () => {
    const { client, rpc } = rpcClient({ data: [{ outcome: "started", run_id: RUN }], error: null });
    expect(await startMissedFromRun(client, STUDENT, RUN, ITEMS)).toEqual({ ok: true, runId: RUN });
    expect(rpc).toHaveBeenCalledWith("start_missed_practice_from_run", {
      student: STUDENT,
      source: RUN,
      target_items: ITEMS,
    });
  });

  it("passes a refusal on, and fails on an error or an answer it does not know", async () => {
    for (const outcome of ["not_found", "invalid", "empty"] as const) {
      const { client } = rpcClient({ data: [{ outcome, run_id: null }], error: null });
      expect(await startMissedFromRun(client, STUDENT, RUN, ITEMS)).toEqual({
        ok: false,
        reason: outcome,
      });
    }
    const failing = rpcClient({ data: null, error: { message: "down" } });
    expect(await startMissedFromRun(failing.client, STUDENT, RUN, ITEMS)).toEqual({
      ok: false,
      reason: "failed",
    });
    const odd = rpcClient({ data: [{ outcome: "something" }], error: null });
    expect(await startMissedFromRun(odd.client, STUDENT, RUN, ITEMS)).toEqual({
      ok: false,
      reason: "failed",
    });
  });
});

describe("startMissedFromAssignment", () => {
  it("names the counted attempt, or leaves it out when there is none", async () => {
    const { client, rpc } = rpcClient({ data: [{ outcome: "started", run_id: RUN }], error: null });
    await startMissedFromAssignment(client, STUDENT, ASSIGNMENT, ITEMS, "attempt-1");
    expect(rpc).toHaveBeenLastCalledWith("start_missed_practice_from_assignment", {
      student: STUDENT,
      target_assignment: ASSIGNMENT,
      target_items: ITEMS,
      best_attempt: "attempt-1",
    });
    await startMissedFromAssignment(client, STUDENT, ASSIGNMENT, ITEMS, null);
    expect(rpc).toHaveBeenLastCalledWith("start_missed_practice_from_assignment", {
      student: STUDENT,
      target_assignment: ASSIGNMENT,
      target_items: ITEMS,
    });
  });
});

describe("readMissedRun", () => {
  it("reads the header, naming where the run came from", async () => {
    const row = {
      run_id: RUN,
      bank_id: "bank",
      title: "Week 7",
      seed: "seed",
      source_kind: "assignment",
      source_id: ASSIGNMENT,
    };
    const { client } = rpcClient({ data: [row], error: null });
    expect(await readMissedRun(client, STUDENT, RUN)).toEqual({
      ok: true,
      run: {
        runId: RUN,
        bankId: "bank",
        title: "Week 7",
        seed: "seed",
        source: { kind: "assignment", id: ASSIGNMENT },
      },
    });
    const practice = rpcClient({
      data: [{ ...row, source_kind: "practice", source_id: "run0" }],
      error: null,
    });
    const read = await readMissedRun(practice.client, STUDENT, RUN);
    expect(read.ok && read.run.source).toEqual({ kind: "practice", bankId: "bank" });
  });

  it("is not found with no row, and failed on an error", async () => {
    expect(await readMissedRun(rpcClient({ data: [], error: null }).client, STUDENT, RUN)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      await readMissedRun(rpcClient({ data: null, error: { message: "x" } }).client, STUDENT, RUN),
    ).toEqual({ ok: false, reason: "failed" });
  });
});

describe("readRunMarks", () => {
  function tableClient(reply: Reply) {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      limit: vi.fn(async () => reply),
    };
    return { from: vi.fn(() => query) } as unknown as SupabaseClient<Database>;
  }

  it("reads points and maximum by question, numbers from strings included", async () => {
    const client = tableClient({
      data: [{ item_id: "a", points: "0.5", max_points: 1 }],
      error: null,
    });
    expect(await readRunMarks(client, RUN)).toEqual(
      new Map([["a", { points: 0.5, maxPoints: 1 }]]),
    );
  });

  it("is null on an error", async () => {
    expect(
      await readRunMarks(tableClient({ data: null, error: { message: "x" } }), RUN),
    ).toBeNull();
  });
});
