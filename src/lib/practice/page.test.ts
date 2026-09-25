import { describe, expect, it, vi } from "vitest";
import { FIXTURES } from "@/lib/ngn/fixtures";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { PRACTICE_START_LIMIT } from "./limits";
import { loadPracticePage, startPracticeOver, type PracticePageStore } from "./page";

const MC = itemSchema.parse(FIXTURES.multiple_choice.canonical) as Item;
const STUDENT = "00000000-0000-4000-8000-0000000000d1";
const BANK = "00000000-0000-4000-8000-0000000000b1";
const ITEM = "00000000-0000-4000-8000-0000000000f1";
const RUN = {
  runId: "00000000-0000-4000-8000-0000000000a1",
  bankId: BANK,
  bankName: "Cardiac week",
  seed: "5d0c6a3e-0f6b-4d7e-9b1a-2f3c4d5e6f70",
};

function fakeStore(overrides: Partial<PracticePageStore> = {}): PracticePageStore {
  return {
    open: vi.fn(async () => ({ ok: true as const, run: RUN })),
    slots: vi.fn(async () => ({
      slots: [{ itemId: ITEM, caseStudyId: null, step: null }],
      answered: new Set<string>(),
    })),
    items: vi.fn(async () => [{ rowId: ITEM, item: MC }]),
    caseStudies: vi.fn(async () => []),
    answers: vi.fn(async () => ({})),
    ...overrides,
  };
}

describe("loadPracticePage", () => {
  it("opens the run, checks it again, then reads the items and this run's answers", async () => {
    const store = fakeStore();
    const view = await loadPracticePage(store, STUDENT, BANK);
    expect(view.kind).toBe("ready");
    if (view.kind !== "ready") return;
    expect(view.view.total).toBe(1);
    expect(view.view.bankName).toBe("Cardiac week");
    expect(store.open).toHaveBeenCalledWith(STUDENT, BANK, false);
    expect(store.slots).toHaveBeenCalledWith(STUDENT, RUN.runId);
    expect(store.items).toHaveBeenCalledWith([ITEM]);
    expect(store.answers).toHaveBeenCalledWith(RUN.runId);
    expect(JSON.stringify(view)).not.toContain(RUN.seed);
  });

  it("is missing when the bank is not shared with this student, and reads nothing else", async () => {
    const store = fakeStore({
      open: vi.fn(async () => ({ ok: false as const, reason: "not_found" as const })),
    });
    expect(await loadPracticePage(store, STUDENT, BANK)).toEqual({ kind: "missing" });
    expect(store.slots).not.toHaveBeenCalled();
    expect(store.items).not.toHaveBeenCalled();
    expect(store.answers).not.toHaveBeenCalled();
  });

  it("fails when the run cannot be opened or listed, or its items cannot be read", async () => {
    const failed = { ok: false as const, reason: "failed" as const };
    expect(
      await loadPracticePage(fakeStore({ open: vi.fn(async () => failed) }), STUDENT, BANK),
    ).toEqual({ kind: "failed" });
    expect(
      await loadPracticePage(fakeStore({ slots: vi.fn(async () => null) }), STUDENT, BANK),
    ).toEqual({ kind: "failed" });
    expect(
      await loadPracticePage(fakeStore({ items: vi.fn(async () => null) }), STUDENT, BANK),
    ).toEqual({ kind: "failed" });
    expect(
      await loadPracticePage(fakeStore({ answers: vi.fn(async () => null) }), STUDENT, BANK),
    ).toEqual({ kind: "failed" });
    expect(
      await loadPracticePage(fakeStore({ caseStudies: vi.fn(async () => null) }), STUDENT, BANK),
    ).toEqual({ kind: "failed" });
  });

  it("asks for each case study once", async () => {
    const CASE = "00000000-0000-4000-8000-0000000000c1";
    const store = fakeStore({
      slots: vi.fn(async () => ({
        slots: [
          { itemId: ITEM, caseStudyId: CASE, step: 1 },
          { itemId: "00000000-0000-4000-8000-0000000000f2", caseStudyId: CASE, step: 2 },
        ],
        answered: new Set<string>(),
      })),
    });
    await loadPracticePage(store, STUDENT, BANK);
    expect(store.caseStudies).toHaveBeenCalledWith([CASE]);
  });
});

describe("startPracticeOver", () => {
  it("opens a fresh run", async () => {
    const store = fakeStore();
    expect(await startPracticeOver(store, createMemoryRateLimitStore(), STUDENT, BANK)).toBe(
      "started",
    );
    expect(store.open).toHaveBeenCalledWith(STUDENT, BANK, true);
  });

  it("says when the bank is no longer shared", async () => {
    const store = fakeStore({
      open: vi.fn(async () => ({ ok: false as const, reason: "not_found" as const })),
    });
    expect(await startPracticeOver(store, createMemoryRateLimitStore(), STUDENT, BANK)).toBe(
      "not_found",
    );
  });

  it("is limited per student", async () => {
    const limiter = createMemoryRateLimitStore();
    for (let n = 0; n < PRACTICE_START_LIMIT.attempts; n += 1) {
      await limiter.hit("practice_start", STUDENT, PRACTICE_START_LIMIT);
    }
    const store = fakeStore();
    expect(await startPracticeOver(store, limiter, STUDENT, BANK)).toBe("rate_limited");
    expect(store.open).not.toHaveBeenCalled();
  });
});
