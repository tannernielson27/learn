import { afterEach, describe, expect, it, vi } from "vitest";
import { DAY_MS, REVIEW_SITTING_LIMIT } from "@/lib/ngn/reviewSchedule";
import type { RateLimitStore } from "@/lib/rateLimit/store";
import type { DueReviewItem } from "@/lib/supabase/review";
import {
  fillReviewList,
  pickReviewSitting,
  startReviewSitting,
  type ReviewListStore,
} from "./review";

const STUDENT = "00000000-0000-4000-8000-0000000627d1";
const RUN = "00000000-0000-4000-8000-0000000627a1";
const A = "00000000-0000-4000-8000-0000000627e1";
const B = "00000000-0000-4000-8000-0000000627e2";
const NOW = Date.UTC(2026, 10, 27, 9);

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const due = (n: number, hoursAgo: number, workspaceId = A): DueReviewItem => ({
  questionId: id(n),
  workspaceId,
  state: { kind: "waiting", gapDays: 1, dueAt: NOW - hoursAgo * 60 * 60 * 1000 },
});

function store(overrides: Partial<ReviewListStore> = {}): ReviewListStore {
  return {
    fill: vi.fn(async () => 0),
    due: vi.fn(async () => [due(1, 2), due(2, 1)]),
    start: vi.fn(async () => ({ ok: true as const, runId: RUN })),
    ...overrides,
  };
}

const limiter = (within = true): RateLimitStore =>
  ({ hit: vi.fn(async () => within) }) as unknown as RateLimitStore;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fillReviewList, on the student home's load", () => {
  it("asks once for the verified student", async () => {
    const s = store({ fill: vi.fn(async () => 3) });
    await fillReviewList(s, STUDENT);
    expect(s.fill).toHaveBeenCalledTimes(1);
    expect(s.fill).toHaveBeenCalledWith(STUDENT);
  });

  it("logs a failed call without the student's id and carries on", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      fillReviewList(store({ fill: vi.fn(async () => null) }), STUDENT),
    ).resolves.toBeUndefined();
    await expect(
      fillReviewList(
        store({ fill: vi.fn(async () => Promise.reject(new TypeError("down"))) }),
        STUDENT,
      ),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain(STUDENT);
    expect(JSON.stringify(log.mock.calls)).toContain("TypeError");
  });
});

describe("pickReviewSitting", () => {
  it("takes the earliest due first, ten at most", () => {
    const items = Array.from({ length: 14 }, (_, n) => due(n + 1, n + 1));
    const picked = pickReviewSitting(items, NOW);
    expect(picked).toHaveLength(REVIEW_SITTING_LIMIT);
    expect(picked[0]).toBe(id(14));
  });

  it("keeps to the earliest one's workspace, and leaves out what is not due", () => {
    const items = [due(1, 1, B), due(2, 3, A), due(3, 2, B), due(4, -24, A)];
    expect(pickReviewSitting(items, NOW)).toEqual([id(2)]);
    expect(pickReviewSitting([due(1, -1)], NOW)).toEqual([]);
    expect(pickReviewSitting([], NOW)).toEqual([]);
    expect(pickReviewSitting([due(1, 0)], NOW + DAY_MS)).toEqual([id(1)]);
  });
});

describe("startReviewSitting", () => {
  it("starts a run of the picked questions", async () => {
    const s = store();
    expect(await startReviewSitting(s, limiter(), STUDENT, NOW)).toEqual({
      kind: "started",
      runId: RUN,
    });
    expect(s.start).toHaveBeenCalledWith(STUDENT, [id(1), id(2)]);
  });

  it("is refused over the limit, and when the limiter is down", async () => {
    const s = store();
    expect(await startReviewSitting(s, limiter(false), STUDENT, NOW)).toEqual({
      kind: "rate_limited",
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const down = {
      hit: vi.fn(async () => Promise.reject(new Error("x"))),
    } as unknown as RateLimitStore;
    expect(await startReviewSitting(s, down, STUDENT, NOW)).toEqual({ kind: "rate_limited" });
    expect(s.due).not.toHaveBeenCalled();
  });

  it("starts nothing when nothing is due, and fails when a read or the start fails", async () => {
    expect(
      await startReviewSitting(store({ due: vi.fn(async () => []) }), limiter(), STUDENT, NOW),
    ).toEqual({
      kind: "empty",
    });
    expect(
      await startReviewSitting(store({ due: vi.fn(async () => null) }), limiter(), STUDENT, NOW),
    ).toEqual({
      kind: "failed",
    });
    for (const reason of ["invalid", "failed"] as const) {
      const s = store({ start: vi.fn(async () => ({ ok: false as const, reason })) });
      expect(await startReviewSitting(s, limiter(), STUDENT, NOW)).toEqual({ kind: "failed" });
    }
    const s = store({
      start: vi.fn(async () => ({ ok: false as const, reason: "empty" as const })),
    });
    expect(await startReviewSitting(s, limiter(), STUDENT, NOW)).toEqual({ kind: "empty" });
  });
});
