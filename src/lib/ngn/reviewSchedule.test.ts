import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isFullMarks as resultsIsFullMarks } from "@/lib/assignments/resultsSummary";
import {
  DAY_MS,
  REVIEW_GAPS_DAYS,
  REVIEW_SITTING_LIMIT,
  dueForReview,
  isDue,
  isFullMarks,
  nextReviewState,
  type ReviewAnswer,
  type ReviewEntry,
  type ReviewGap,
  type ReviewState,
} from "./reviewSchedule";

/** 2026-11-25 09:00 UTC, as epoch milliseconds: the moment every case below answers at. */
const T = Date.UTC(2026, 10, 25, 9, 0, 0);
const days = (n: number) => n * DAY_MS;

const FULL = { points: 2, maxPoints: 2 };
const PARTIAL = { points: 1, maxPoints: 2 };
const NONE = { points: 0, maxPoints: 2 };

const waiting = (gapDays: ReviewGap, dueAt: number): ReviewState => ({
  kind: "waiting",
  gapDays,
  dueAt,
});
const retired = (retiredAt: number): ReviewState => ({ kind: "retired", retiredAt });

const inReview = (mark: ReviewAnswer["mark"], answeredAt = T): ReviewAnswer => ({
  where: "review",
  mark,
  answeredAt,
});
const elsewhere = (mark: ReviewAnswer["mark"], answeredAt = T): ReviewAnswer => ({
  where: "elsewhere",
  mark,
  answeredAt,
});

describe("the review schedule's constants (#626, ADR 0019)", () => {
  it("has the fixed gaps of 1, 3, 7 and 14 days, a 24-hour day and ten at a sitting", () => {
    expect(REVIEW_GAPS_DAYS).toEqual([1, 3, 7, 14]);
    expect(DAY_MS).toBe(24 * 60 * 60 * 1000);
    expect(REVIEW_SITTING_LIMIT).toBe(10);
  });

  it("draws full marks with the results summary's own line, not a copy of it", () => {
    expect(isFullMarks).toBe(resultsIsFullMarks);
  });
});

/**
 * Every move the schedule makes. `before` is the stored state (`null`: never in review), `answer`
 * is what the student just did at time T (after being shown the key), `after` is the new state.
 * Read top to bottom, this is the rule set in ADR 0019.
 */
const MOVES: ReadonlyArray<{
  move: string;
  before: ReviewState | null;
  answer: ReviewAnswer;
  after: ReviewState | null;
}> = [
  // Entering review
  {
    move: "enter: missed outright elsewhere, never in review -> 1 day",
    before: null,
    answer: elsewhere(NONE),
    after: waiting(1, T + days(1)),
  },
  {
    move: "enter: partial credit elsewhere is a miss -> 1 day",
    before: null,
    answer: elsewhere(PARTIAL),
    after: waiting(1, T + days(1)),
  },
  {
    move: "stay out: full marks elsewhere, never in review",
    before: null,
    answer: elsewhere(FULL),
    after: null,
  },
  // Each gap forward on full marks in review, due exactly then
  {
    move: "forward: full marks at the 1 day gap -> 3 days",
    before: waiting(1, T),
    answer: inReview(FULL),
    after: waiting(3, T + days(3)),
  },
  {
    move: "forward: full marks at the 3 day gap -> 7 days",
    before: waiting(3, T),
    answer: inReview(FULL),
    after: waiting(7, T + days(7)),
  },
  {
    move: "forward: full marks at the 7 day gap -> 14 days",
    before: waiting(7, T),
    answer: inReview(FULL),
    after: waiting(14, T + days(14)),
  },
  {
    move: "retire: full marks at the 14 day gap -> learned",
    before: waiting(14, T),
    answer: inReview(FULL),
    after: retired(T),
  },
  {
    move: "forward: the next gap counts from the answer, not from when it fell due",
    before: waiting(3, T - days(2)),
    answer: inReview(FULL),
    after: waiting(7, T + days(7)),
  },
  // Back to 1 day from each gap on a miss in review
  {
    move: "back: partial credit at the 1 day gap -> 1 day",
    before: waiting(1, T),
    answer: inReview(PARTIAL),
    after: waiting(1, T + days(1)),
  },
  {
    move: "back: missed at the 3 day gap -> 1 day",
    before: waiting(3, T),
    answer: inReview(NONE),
    after: waiting(1, T + days(1)),
  },
  {
    move: "back: partial credit at the 7 day gap -> 1 day",
    before: waiting(7, T),
    answer: inReview(PARTIAL),
    after: waiting(1, T + days(1)),
  },
  {
    move: "back: missed at the 14 day gap -> 1 day",
    before: waiting(14, T),
    answer: inReview(NONE),
    after: waiting(1, T + days(1)),
  },
  // Missing it again somewhere else
  {
    move: "return: a retired question missed elsewhere -> 1 day",
    before: retired(T - days(30)),
    answer: elsewhere(PARTIAL),
    after: waiting(1, T + days(1)),
  },
  {
    move: "back: a waiting question missed elsewhere -> 1 day",
    before: waiting(7, T + days(5)),
    answer: elsewhere(NONE),
    after: waiting(1, T + days(1)),
  },
  // 6(a): full marks outside review changes nothing
  {
    move: "unchanged: full marks elsewhere on a waiting question",
    before: waiting(7, T + days(5)),
    answer: elsewhere(FULL),
    after: waiting(7, T + days(5)),
  },
  {
    move: "unchanged: full marks elsewhere on a retired question",
    before: retired(T - days(30)),
    answer: elsewhere(FULL),
    after: retired(T - days(30)),
  },
  // 6(b): a review answer before the question is due counts as an answer elsewhere
  {
    move: "early: full marks in review before it is due changes nothing",
    before: waiting(3, T + 1),
    answer: inReview(FULL),
    after: waiting(3, T + 1),
  },
  {
    move: "early: a miss in review before it is due -> 1 day",
    before: waiting(3, T + days(1)),
    answer: inReview(PARTIAL),
    after: waiting(1, T + days(1)),
  },
  // A review answer on a question that is not waiting is an answer elsewhere
  {
    move: "not waiting: full marks in review on a retired question changes nothing",
    before: retired(T - days(1)),
    answer: inReview(FULL),
    after: retired(T - days(1)),
  },
  {
    move: "not waiting: a miss in review on a question never in review -> 1 day",
    before: null,
    answer: inReview(NONE),
    after: waiting(1, T + days(1)),
  },
  // 6(e): a mark worth nothing, or one no scorer could give, changes nothing
  {
    move: "ignored: maxPoints 0 on a question never in review",
    before: null,
    answer: elsewhere({ points: 0, maxPoints: 0 }),
    after: null,
  },
  {
    move: "ignored: maxPoints 0 in review at the 14 day gap",
    before: waiting(14, T),
    answer: inReview({ points: 0, maxPoints: 0 }),
    after: waiting(14, T),
  },
  {
    move: "ignored: a negative score",
    before: waiting(3, T),
    answer: inReview({ points: -1, maxPoints: 2 }),
    after: waiting(3, T),
  },
  {
    move: "ignored: a score that is not a number",
    before: null,
    answer: elsewhere({ points: Number.NaN, maxPoints: 2 }),
    after: null,
  },
  {
    move: "full marks: points above the maximum still reach the line",
    before: waiting(1, T),
    answer: inReview({ points: 3, maxPoints: 2 }),
    after: waiting(3, T + days(3)),
  },
];

describe("nextReviewState: the table of cases (#626)", () => {
  it.each(MOVES)("$move", ({ before, answer, after }) => {
    expect(nextReviewState(before, answer)).toEqual(after);
  });

  it("gives the same result for the same inputs, every time", () => {
    for (const { before, answer } of MOVES) {
      expect(nextReviewState(before, answer)).toEqual(nextReviewState(before, answer));
    }
  });

  it("never changes the state it is handed", () => {
    const before = waiting(3, T);
    nextReviewState(before, inReview(FULL));
    expect(before).toEqual(waiting(3, T));
  });

  it("refuses a time that is not a finite number", () => {
    expect(() => nextReviewState(null, elsewhere(NONE, Number.NaN))).toThrow(RangeError);
    expect(() => nextReviewState(null, elsewhere(NONE, Infinity))).toThrow(RangeError);
  });
});

describe("isDue", () => {
  it("is due from the moment its due time arrives, not a millisecond before", () => {
    expect(isDue(waiting(1, T), T - 1)).toBe(false);
    expect(isDue(waiting(1, T), T)).toBe(true);
    expect(isDue(waiting(1, T), T + days(9))).toBe(true);
  });

  it("is never due once retired", () => {
    expect(isDue(retired(T - days(100)), T)).toBe(false);
  });
});

const entry = (questionId: string, state: ReviewState): ReviewEntry => ({ questionId, state });

describe("dueForReview: what comes back in a sitting (#626)", () => {
  it("returns the oldest due first and leaves out what is not yet due or retired", () => {
    const entries = [
      entry("q-late", waiting(1, T - days(1))),
      entry("q-future", waiting(3, T + 1)),
      entry("q-oldest", waiting(7, T - days(5))),
      entry("q-retired", retired(T - days(20))),
      entry("q-now", waiting(14, T)),
    ];
    expect(dueForReview(entries, T).map((e) => e.questionId)).toEqual([
      "q-oldest",
      "q-late",
      "q-now",
    ]);
  });

  it("never returns more than ten by default, so a backlog is not a wall", () => {
    const backlog = Array.from({ length: 25 }, (_, i) =>
      entry(`q-${String(i).padStart(2, "0")}`, waiting(1, T - days(25 - i))),
    );
    const picked = dueForReview(backlog, T);
    expect(picked).toHaveLength(REVIEW_SITTING_LIMIT);
    expect(picked.map((e) => e.questionId)).toEqual(
      backlog.slice(0, REVIEW_SITTING_LIMIT).map((e) => e.questionId),
    );
  });

  it("takes a smaller limit, and treats a limit below one as none", () => {
    const entries = [entry("a", waiting(1, T - 2)), entry("b", waiting(1, T - 1))];
    expect(dueForReview(entries, T, 1).map((e) => e.questionId)).toEqual(["a"]);
    expect(dueForReview(entries, T, 0)).toEqual([]);
    expect(dueForReview(entries, T, -3)).toEqual([]);
    expect(dueForReview(entries, T, 1.9).map((e) => e.questionId)).toEqual(["a"]);
  });

  it("breaks a tie on due time by question id, whatever order the list came in", () => {
    const tied = [
      entry("q-c", waiting(1, T - 1)),
      entry("q-a", waiting(3, T - 1)),
      entry("q-b", waiting(7, T - 1)),
    ];
    const pick = (list: ReviewEntry[]) => dueForReview(list, T).map((e) => e.questionId);
    expect(pick(tied)).toEqual(["q-a", "q-b", "q-c"]);
    expect(pick([...tied].reverse())).toEqual(["q-a", "q-b", "q-c"]);
  });

  it("orders ids by code unit, not by locale", () => {
    const tied = [entry("b", waiting(1, T)), entry("B", waiting(1, T)), entry("a", waiting(1, T))];
    expect(dueForReview(tied, T).map((e) => e.questionId)).toEqual(["B", "a", "b"]);
  });

  it("keeps the list's order for two rows that share a due time and an id", () => {
    const rows = [
      { questionId: "q", state: waiting(1, T), row: 1 },
      { questionId: "q", state: waiting(3, T), row: 2 },
    ];
    expect(dueForReview(rows, T).map((r) => r.row)).toEqual([1, 2]);
  });

  it("keeps whatever else the caller's rows carry, and leaves the list alone", () => {
    const rows = [
      { questionId: "q-2", state: waiting(1, T - 1), bankId: "bank-1" },
      { questionId: "q-1", state: waiting(1, T - 2), bankId: "bank-2" },
    ];
    const picked = dueForReview(rows, T);
    expect(picked.map((r) => r.bankId)).toEqual(["bank-2", "bank-1"]);
    expect(rows.map((r) => r.questionId)).toEqual(["q-2", "q-1"]);
  });

  it("returns nothing from an empty list", () => {
    expect(dueForReview([], T)).toEqual([]);
  });
});

describe("no clock of its own", () => {
  const source = readFileSync(path.resolve(import.meta.dirname, "reviewSchedule.ts"), "utf8");

  it("never reads the system clock", () => {
    expect(source).not.toMatch(/Date\.now\s*\(/);
    expect(source).not.toMatch(/new\s+Date\s*\(\s*\)/);
    expect(source).not.toMatch(/performance\.now\s*\(/);
  });
});
