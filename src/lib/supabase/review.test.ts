import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { ReviewState } from "@/lib/ngn/reviewSchedule";
import { HOUR_MS, REVIEW_CASE_BASE, REVIEW_CASES } from "@/lib/practice/reviewCases";
import type { Database } from "./database.types";
import { readRunSlots } from "./practice";
import {
  fillReviewFromAssignments,
  readDueReviewItems,
  readMyReviewDue,
  reviewStateFromRow,
  reviewStateToRow,
  startReviewRun,
} from "./review";

type Reply = { data: unknown; error: unknown };

function rpcClient(reply: Reply) {
  const rpc = vi.fn(async () => reply);
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

const STUDENT = "00000000-0000-4000-8000-0000000627d1";
const RUN = "00000000-0000-4000-8000-0000000627a1";
const ITEM = "00000000-0000-4000-8000-0000000627f1";
const WORKSPACE = "00000000-0000-4000-8000-0000000627e1";
const DUE = "2026-11-27T09:00:00.000Z";

/** What a key, a rationale or a stem would put in a reply if a read ever carried one. */
const SECRETS = {
  answer_key: { correctOptionId: "secret_627" },
  rationale: { general: "rationale_627" },
  content: { stem: "stem_627" },
};
const SECRET_STRINGS = ["secret_627", "rationale_627", "stem_627", "answer_key", "rationale"];

describe("a stored review row and ADR 0019's state (#627)", () => {
  it("round-trips every state the shared cases reach, one row per state", () => {
    const states = REVIEW_CASES.flatMap((c): ReviewState[] => {
      const e = c.expected;
      if (e === null) return [];
      return [
        e.kind === "retired"
          ? { kind: "retired", retiredAt: REVIEW_CASE_BASE + e.retiredHour * HOUR_MS }
          : { kind: "waiting", gapDays: e.gapDays, dueAt: REVIEW_CASE_BASE + e.dueHour * HOUR_MS },
      ];
    });
    expect(states.length).toBeGreaterThan(5);
    for (const state of states) {
      const row = reviewStateToRow(state);
      // Nothing is stored for a state that it does not hold.
      if (state.kind === "retired") expect([row.gap_days, row.due_at]).toEqual([null, null]);
      else expect(row.retired_at).toBeNull();
      expect(reviewStateFromRow(row)).toEqual(state);
    }
  });

  it("reads a database time with its offset", () => {
    expect(
      reviewStateFromRow({ gap_days: 3, due_at: "2026-11-27 09:00:00+00", retired_at: null }),
    ).toEqual({ kind: "waiting", gapDays: 3, dueAt: Date.parse(DUE) });
  });

  it("throws a RangeError on a row no state could be", () => {
    for (const row of [
      { gap_days: 2, due_at: DUE, retired_at: null },
      { gap_days: 1, due_at: DUE, retired_at: DUE },
      { gap_days: null, due_at: null, retired_at: null },
      { gap_days: 1, due_at: null, retired_at: null },
      { gap_days: 1, due_at: "not a time", retired_at: null },
      { gap_days: null, due_at: null, retired_at: "not a time" },
    ]) {
      expect(() => reviewStateFromRow(row)).toThrow(RangeError);
    }
  });
});

describe("readMyReviewDue, on the bytes the student is handed", () => {
  it("carries the count and the next time, and nothing else, whatever the reply held", async () => {
    const reply = { data: [{ due: 2, next_due_at: DUE, item_id: ITEM, ...SECRETS }], error: null };
    // The control: the reply the reader is handed does carry a key, a rationale and a stem.
    const given = JSON.stringify(reply);
    for (const secret of SECRET_STRINGS) expect(given).toContain(secret);

    const { client, rpc } = rpcClient(reply);
    const read = await readMyReviewDue(client);
    expect(rpc).toHaveBeenCalledWith("my_review_due");
    expect(read).toEqual({ due: 2, nextDueAt: DUE });
    const bytes = JSON.stringify(read);
    for (const secret of [...SECRET_STRINGS, ITEM]) expect(bytes).not.toContain(secret);
  });

  it("reads none due as nought, and fails on an error or a count that cannot be", async () => {
    expect(await readMyReviewDue(rpcClient({ data: [], error: null }).client)).toEqual({
      due: 0,
      nextDueAt: null,
    });
    expect(
      await readMyReviewDue(rpcClient({ data: null, error: { message: "x" } }).client),
    ).toBeNull();
    expect(
      await readMyReviewDue(rpcClient({ data: [{ due: -1 }], error: null }).client),
    ).toBeNull();
    expect(
      await readMyReviewDue(rpcClient({ data: [{ due: "x" }], error: null }).client),
    ).toBeNull();
  });
});

describe("a review run's question list, on its bytes", () => {
  it("carries ids, case study and step only, whatever the reply held", async () => {
    const reply = {
      data: [
        { item_id: ITEM, case_study_id: null, step: null, ordinal: 1, answered: false, ...SECRETS },
      ],
      error: null,
    };
    for (const secret of SECRET_STRINGS) expect(JSON.stringify(reply)).toContain(secret);
    const read = await readRunSlots(rpcClient(reply).client, STUDENT, RUN);
    expect(read?.slots).toEqual([{ itemId: ITEM, caseStudyId: null, step: null }]);
    const bytes = JSON.stringify({ slots: read?.slots, answered: [...(read?.answered ?? [])] });
    for (const secret of SECRET_STRINGS) expect(bytes).not.toContain(secret);
  });

  it("and so does the server's list of due questions", async () => {
    const reply = {
      data: [{ item_id: ITEM, org_id: WORKSPACE, gap_days: 1, due_at: DUE, ...SECRETS }],
      error: null,
    };
    for (const secret of SECRET_STRINGS) expect(JSON.stringify(reply)).toContain(secret);
    const { client, rpc } = rpcClient(reply);
    const read = await readDueReviewItems(client, STUDENT);
    expect(rpc).toHaveBeenCalledWith("review_due_items", { student: STUDENT });
    expect(read).toEqual([
      {
        questionId: ITEM,
        workspaceId: WORKSPACE,
        state: { kind: "waiting", gapDays: 1, dueAt: Date.parse(DUE) },
      },
    ]);
    for (const secret of SECRET_STRINGS) expect(JSON.stringify(read)).not.toContain(secret);
    expect(
      await readDueReviewItems(rpcClient({ data: null, error: {} }).client, STUDENT),
    ).toBeNull();
  });
});

describe("fillReviewFromAssignments", () => {
  it("names the student and reads how many were added", async () => {
    const { client, rpc } = rpcClient({ data: 2, error: null });
    expect(await fillReviewFromAssignments(client, STUDENT)).toBe(2);
    expect(rpc).toHaveBeenCalledWith("fill_review_from_assignments", { student: STUDENT });
  });

  it("is null on an error or an answer that is not a count", async () => {
    expect(
      await fillReviewFromAssignments(rpcClient({ data: null, error: {} }).client, STUDENT),
    ).toBeNull();
    expect(
      await fillReviewFromAssignments(rpcClient({ data: "2", error: null }).client, STUDENT),
    ).toBeNull();
  });
});

describe("startReviewRun", () => {
  it("names the student and the questions, and reads the new run back", async () => {
    const { client, rpc } = rpcClient({ data: [{ outcome: "started", run_id: RUN }], error: null });
    expect(await startReviewRun(client, STUDENT, [ITEM])).toEqual({ ok: true, runId: RUN });
    expect(rpc).toHaveBeenCalledWith("start_review_run", {
      student: STUDENT,
      target_items: [ITEM],
    });
  });

  it("passes a refusal on, and fails on an error or an answer it does not know", async () => {
    for (const outcome of ["invalid", "empty"] as const) {
      const { client } = rpcClient({ data: [{ outcome, run_id: null }], error: null });
      expect(await startReviewRun(client, STUDENT, [ITEM])).toEqual({ ok: false, reason: outcome });
    }
    for (const reply of [
      { data: null, error: { message: "down" } },
      { data: [{ outcome: "not_found" }], error: null },
      { data: [], error: null },
    ]) {
      expect(await startReviewRun(rpcClient(reply).client, STUDENT, [ITEM])).toEqual({
        ok: false,
        reason: "failed",
      });
    }
  });
});
