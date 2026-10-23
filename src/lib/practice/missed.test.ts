import { describe, expect, it, vi } from "vitest";
import type { ResultEntry, ResultsView } from "@/lib/assignments/results";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import type { ScoreResult } from "@/lib/ngn/types";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { PRACTICE_START_LIMIT } from "./limits";
import {
  isFullMarks,
  isMissedResult,
  missedInResults,
  missedInRun,
  startMissedPractice,
  type MissedStore,
} from "./missed";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const STUDENT = "00000000-0000-4000-8000-0000000479d1";
const RUN = "00000000-0000-4000-8000-0000000479a1";
const NEW_RUN = "00000000-0000-4000-8000-0000000479a2";
const ASSIGNMENT = "00000000-0000-4000-8000-0000000479b1";
const ATTEMPT = "00000000-0000-4000-8000-0000000479c1";
const row = (n: number) => `00000000-0000-4000-8000-00000000047${n}`;

const slot = (n: number) => ({ itemId: row(n), caseStudyId: null, step: null });

const score = (points: number, maxPoints = 1): ScoreResult => ({
  points,
  maxPoints,
  model: "zero_one",
  breakdown: [],
});

const answered = (n: number, points: number, maxPoints = 1): ResultEntry => ({
  rowId: row(n),
  item: MC,
  outcome: {
    kind: "answered",
    response: { type: "multiple_choice", optionId: "a" },
    score: score(points, maxPoints),
  },
});
const other = (n: number, kind: "not_answered" | "not_attempted" | "unmarked" | "unreadable") =>
  ({ rowId: row(n), item: MC, outcome: { kind } }) as ResultEntry;

function resultsView(entries: ResultEntry[], bestAttemptId: string | null = ATTEMPT): ResultsView {
  return {
    kind: "results",
    assignment: {
      id: ASSIGNMENT,
      title: "Week 7",
      closesAt: "2026-10-20T12:00:00Z",
      classId: null,
    },
    best: null,
    bestAttemptId,
    attemptsMade: 1,
    entries,
    record: null,
  };
}

function fakeStore(over: Partial<MissedStore> = {}): MissedStore {
  return {
    slots: vi.fn(async () => ({
      slots: [slot(1), slot(2), slot(3), slot(4)],
      answered: new Set<string>(),
    })),
    marks: vi.fn(
      async () =>
        new Map([
          [row(1), { points: 1, maxPoints: 1 }],
          [row(2), { points: 0, maxPoints: 1 }],
          [row(3), { points: 1, maxPoints: 2 }],
        ]),
    ),
    fromRun: vi.fn(async () => ({ ok: true as const, runId: NEW_RUN })),
    results: vi.fn(async () =>
      resultsView([answered(1, 1), answered(2, 0), other(3, "not_answered")]),
    ),
    fromAssignment: vi.fn(async () => ({ ok: true as const, runId: NEW_RUN })),
    ...over,
  };
}

describe("isFullMarks", () => {
  it("is the player's All correct line: a maximum above nought, reached", () => {
    expect(isFullMarks({ points: 2, maxPoints: 2 })).toBe(true);
    expect(isFullMarks({ points: 1, maxPoints: 2 })).toBe(false);
    expect(isFullMarks({ points: 0, maxPoints: 0 })).toBe(false);
  });
});

describe("missedInRun", () => {
  it("lists the questions answered below full marks, in play order, and never an unanswered one", () => {
    const marks = new Map([
      [row(3), { points: 0, maxPoints: 1 }],
      [row(1), { points: 1, maxPoints: 1 }],
      [row(2), { points: 0.5, maxPoints: 1 }],
    ]);
    expect(missedInRun([slot(1), slot(2), slot(3), slot(4)], marks)).toEqual([row(2), row(3)]);
  });
});

describe("missedInResults", () => {
  it("counts wrong, partial and blank questions, and leaves out one that cannot be read", () => {
    const entries = [
      answered(1, 1),
      answered(2, 0),
      answered(3, 1, 2),
      other(4, "not_answered"),
      other(5, "not_attempted"),
      other(6, "unmarked"),
      other(7, "unreadable"),
    ];
    expect(missedInResults(entries)).toEqual([row(2), row(3), row(4), row(5), row(6)]);
    expect(isMissedResult(other(7, "unreadable"))).toBe(false);
  });
});

describe("startMissedPractice", () => {
  it("from a run: reads the run on the server, then names only what it missed", async () => {
    const store = fakeStore();
    const outcome = await startMissedPractice(store, createMemoryRateLimitStore(), STUDENT, {
      kind: "run",
      runId: RUN,
    });
    expect(outcome).toEqual({ kind: "started", runId: NEW_RUN });
    expect(store.slots).toHaveBeenCalledWith(STUDENT, RUN);
    expect(store.fromRun).toHaveBeenCalledWith(STUDENT, RUN, [row(2), row(3)]);
  });

  it("from a run that is not live: not found, and nothing is started", async () => {
    const store = fakeStore({
      slots: vi.fn(async () => ({ slots: [], answered: new Set<string>() })),
    });
    expect(
      await startMissedPractice(store, createMemoryRateLimitStore(), STUDENT, {
        kind: "run",
        runId: RUN,
      }),
    ).toEqual({ kind: "not_found" });
    expect(store.marks).not.toHaveBeenCalled();
    expect(store.fromRun).not.toHaveBeenCalled();
  });

  it("from a run with nothing missed: empty", async () => {
    const store = fakeStore({
      marks: vi.fn(async () => new Map([[row(1), { points: 1, maxPoints: 1 }]])),
    });
    expect(
      await startMissedPractice(store, createMemoryRateLimitStore(), STUDENT, {
        kind: "run",
        runId: RUN,
      }),
    ).toEqual({ kind: "empty" });
    expect(store.fromRun).not.toHaveBeenCalled();
  });

  it("fails when a read fails, and when the database refuses the list it was just given", async () => {
    const limiter = createMemoryRateLimitStore();
    const source = { kind: "run" as const, runId: RUN };
    expect(
      await startMissedPractice(
        fakeStore({ slots: vi.fn(async () => null) }),
        limiter,
        STUDENT,
        source,
      ),
    ).toEqual({
      kind: "failed",
    });
    expect(
      await startMissedPractice(
        fakeStore({ marks: vi.fn(async () => null) }),
        limiter,
        STUDENT,
        source,
      ),
    ).toEqual({
      kind: "failed",
    });
    const refused = fakeStore({
      fromRun: vi.fn(async () => ({ ok: false as const, reason: "invalid" as const })),
    });
    expect(await startMissedPractice(refused, limiter, STUDENT, source)).toEqual({
      kind: "failed",
    });
  });

  it("from an assignment: the released results decide the list, with the counted attempt", async () => {
    const store = fakeStore();
    const outcome = await startMissedPractice(store, createMemoryRateLimitStore(), STUDENT, {
      kind: "assignment",
      assignmentId: ASSIGNMENT,
    });
    expect(outcome).toEqual({ kind: "started", runId: NEW_RUN });
    expect(store.results).toHaveBeenCalledWith(STUDENT, ASSIGNMENT);
    expect(store.fromAssignment).toHaveBeenCalledWith(
      STUDENT,
      ASSIGNMENT,
      [row(2), row(3)],
      ATTEMPT,
    );
  });

  it("from an assignment before its results are released: not found", async () => {
    const pending: ResultsView = {
      kind: "pending",
      assignment: {
        id: ASSIGNMENT,
        title: "Week 7",
        closesAt: "2026-10-30T12:00:00Z",
        classId: null,
      },
    };
    for (const view of [pending, { kind: "missing" } as ResultsView]) {
      const store = fakeStore({ results: vi.fn(async () => view) });
      expect(
        await startMissedPractice(store, createMemoryRateLimitStore(), STUDENT, {
          kind: "assignment",
          assignmentId: ASSIGNMENT,
        }),
      ).toEqual({ kind: "not_found" });
      expect(store.fromAssignment).not.toHaveBeenCalled();
    }
  });

  it("from an assignment: a failed read fails; all correct is empty; the database's refusal is passed on", async () => {
    const source = { kind: "assignment" as const, assignmentId: ASSIGNMENT };
    const limiter = createMemoryRateLimitStore();
    expect(
      await startMissedPractice(
        fakeStore({ results: vi.fn(async () => ({ kind: "failed" }) as ResultsView) }),
        limiter,
        STUDENT,
        source,
      ),
    ).toEqual({ kind: "failed" });
    expect(
      await startMissedPractice(
        fakeStore({ results: vi.fn(async () => resultsView([answered(1, 1)])) }),
        limiter,
        STUDENT,
        source,
      ),
    ).toEqual({ kind: "empty" });
    const gone = fakeStore({
      fromAssignment: vi.fn(async () => ({ ok: false as const, reason: "not_found" as const })),
    });
    expect(await startMissedPractice(gone, limiter, STUDENT, source)).toEqual({
      kind: "not_found",
    });
  });

  it("is counted against the practice start limit", async () => {
    const limiter = createMemoryRateLimitStore();
    const store = fakeStore();
    for (let i = 0; i < PRACTICE_START_LIMIT.attempts; i += 1) {
      await startMissedPractice(store, limiter, STUDENT, { kind: "run", runId: RUN });
    }
    expect(await startMissedPractice(store, limiter, STUDENT, { kind: "run", runId: RUN })).toEqual(
      {
        kind: "rate_limited",
      },
    );
  });

  it("refuses rather than starts when the limiter cannot answer, since each start writes a run", async () => {
    const store = fakeStore();
    const down = {
      hit: () => Promise.reject(new Error("limiter down")),
    } as unknown as ReturnType<typeof createMemoryRateLimitStore>;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await startMissedPractice(store, down, STUDENT, { kind: "run", runId: RUN })).toEqual({
      kind: "rate_limited",
    });
  });
});
