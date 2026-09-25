import { afterEach, describe, expect, it, vi } from "vitest";
import type { HistoryAssignment, HistoryAttempt } from "@/lib/supabase/history";
import type { StepAttempt } from "@/lib/supabase/steps";
import { buildHistory, loadStudentRecord, type HistoryStore } from "./history";

const BASE: HistoryAssignment = {
  id: "w1",
  classId: "c1",
  title: "Week 1",
  closesAt: "2026-09-22T12:00:00Z",
  maxAttempts: 3,
  attempts: [],
};

const attempt = (
  number: number,
  score: number | null,
  maxScore: number | null = 4,
  submittedAt: string | null = "2026-09-22T11:00:00Z",
): HistoryAttempt => ({ id: `t${number}`, number, submittedAt, score, maxScore });

describe("buildHistory (#238)", () => {
  it("keeps the order and the header of each assignment", () => {
    const [first, second] = buildHistory([BASE, { ...BASE, id: "w2", title: "Week 2" }]);
    expect(first).toMatchObject({
      id: "w1",
      classId: "c1",
      title: "Week 1",
      closesAt: "2026-09-22T12:00:00Z",
      maxAttempts: 3,
    });
    expect(second?.id).toBe("w2");
  });

  it("marks an assignment never started as not attempted", () => {
    expect(buildHistory([BASE])[0]).toMatchObject({
      attemptsUsed: 0,
      standing: { kind: "not_attempted" },
    });
  });

  it("counts the best submitted attempt, with its points and percent", () => {
    const [row] = buildHistory([
      { ...BASE, attempts: [attempt(1, 1), attempt(2, 3), attempt(3, 2)] },
    ]);
    expect(row?.attemptsUsed).toBe(3);
    expect(row?.standing).toEqual({
      kind: "scored",
      best: { attemptNumber: 2, score: 3, maxScore: 4, percent: 75 },
    });
  });

  it("gives a tie to the earlier attempt", () => {
    const [row] = buildHistory([{ ...BASE, attempts: [attempt(1, 2), attempt(2, 2)] }]);
    expect(row?.standing).toMatchObject({ kind: "scored", best: { attemptNumber: 1 } });
  });

  it("never counts an attempt that was not submitted", () => {
    const [row] = buildHistory([{ ...BASE, attempts: [attempt(1, 1), attempt(2, 4, 4, null)] }]);
    expect(row?.standing).toMatchObject({ kind: "scored", best: { attemptNumber: 1, score: 1 } });
  });

  it("says an attempt is not marked yet when none has a score", () => {
    const [row] = buildHistory([{ ...BASE, attempts: [attempt(1, null, null, null)] }]);
    expect(row).toMatchObject({ attemptsUsed: 1, standing: { kind: "unmarked" } });
  });

  it("has no percent for an attempt worth nothing", () => {
    const [row] = buildHistory([{ ...BASE, attempts: [attempt(1, 0, 0)] }]);
    expect(row?.standing).toMatchObject({ kind: "scored", best: { percent: null } });
  });

  it("does not change what it is given", () => {
    const input = [{ ...BASE, attempts: [attempt(2, 1), attempt(1, 3)] }];
    const copy = structuredClone(input);
    buildHistory(input);
    expect(input).toEqual(copy);
  });
});

describe("loadStudentRecord (#238, #239)", () => {
  afterEach(() => vi.restoreAllMocks());

  const STEP_ATTEMPT: StepAttempt = {
    assignmentId: "w1",
    number: 1,
    submittedAt: "2026-09-22T11:00:00Z",
    score: 2,
    maxScore: 4,
    marks: [{ cjmmStep: 1, points: 0, maxPoints: 1 }],
  };

  function fakeStore(overrides: Partial<HistoryStore> = {}) {
    const calls: string[] = [];
    const store: HistoryStore = {
      autoSubmit: vi.fn(async () => {
        calls.push("autoSubmit");
        return 0;
      }),
      history: vi.fn(async () => {
        calls.push("history");
        return [{ ...BASE, attempts: [attempt(1, 2)] }];
      }),
      stepAttempts: vi.fn(async () => {
        calls.push("stepAttempts");
        return [STEP_ATTEMPT];
      }),
      ...overrides,
    };
    return { store, calls };
  }

  it("submits this student's attempts left open at close, then reads both", async () => {
    const { store, calls } = fakeStore();
    const { history, steps } = await loadStudentRecord(store, "student-1");
    expect(store.autoSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "student-1" }),
    );
    expect(calls[0]).toBe("autoSubmit");
    expect([...calls].sort()).toEqual(["autoSubmit", "history", "stepAttempts"]);
    expect(history?.[0]?.standing).toMatchObject({ kind: "scored" });
    expect(steps?.steps.find((s) => s.step === 1)).toMatchObject({ items: 1, points: 0 });
  });

  it("still reads when the submit at close fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store } = fakeStore({
      autoSubmit: vi.fn(async () => {
        throw new Error("down");
      }),
    });
    const record = await loadStudentRecord(store, "student-1");
    expect(record.history).toHaveLength(1);
    expect(record.steps).not.toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it("is null for each read that fails, on its own", async () => {
    const noHistory = fakeStore({ history: vi.fn(async () => null) });
    const first = await loadStudentRecord(noHistory.store, "student-1");
    expect(first.history).toBeNull();
    expect(first.steps).not.toBeNull();

    const noSteps = fakeStore({ stepAttempts: vi.fn(async () => null) });
    const second = await loadStudentRecord(noSteps.store, "student-1");
    expect(second.history).toHaveLength(1);
    expect(second.steps).toBeNull();
  });
});
