import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { nextReviewState, type ReviewState } from "@/lib/ngn/reviewSchedule";
import {
  HOUR_MS,
  REVIEW_CASE_BASE,
  REVIEW_CASES,
  reviewCaseSqlRow,
  type CaseState,
} from "./reviewCases";

const at = (hour: number) => REVIEW_CASE_BASE + hour * HOUR_MS;

function toState(state: CaseState): ReviewState | null {
  if (state === null) return null;
  return state.kind === "retired"
    ? { kind: "retired", retiredAt: at(state.retiredHour) }
    : { kind: "waiting", gapDays: state.gapDays, dueAt: at(state.dueHour) };
}

const SQL_TEST = readFileSync(
  resolve(process.cwd(), "supabase/tests/database/review_entries.test.sql"),
  "utf8",
);

describe("the review schedule's shared cases (#627)", () => {
  it.each(REVIEW_CASES)("nextReviewState: $name", (c) => {
    expect(
      nextReviewState(toState(c.current), {
        where: c.where,
        mark: { points: c.points, maxPoints: c.maxPoints },
        answeredAt: at(c.answeredHour),
      }),
    ).toEqual(toState(c.expected));
  });

  it("covers every gap, a retirement, a return, and a mark worth nothing", () => {
    const reached = new Set(
      REVIEW_CASES.flatMap((c) => (c.expected?.kind === "waiting" ? [c.expected.gapDays] : [])),
    );
    expect([...reached].sort((a, b) => a - b)).toEqual([1, 3, 7, 14]);
    expect(
      REVIEW_CASES.some((c) => c.expected?.kind === "retired" && c.current?.kind === "waiting"),
    ).toBe(true);
    expect(
      REVIEW_CASES.some((c) => c.current?.kind === "retired" && c.expected?.kind === "waiting"),
    ).toBe(true);
    expect(REVIEW_CASES.some((c) => c.maxPoints === 0)).toBe(true);
  });

  it("is the very table the database's pgTAP test runs against private.review_next", () => {
    for (const c of REVIEW_CASES) expect(SQL_TEST).toContain(reviewCaseSqlRow(c));
    const sqlRows = SQL_TEST.split("\n").filter((line) => /^\s*\('review case: /.test(line));
    expect(sqlRows).toHaveLength(REVIEW_CASES.length);
  });

  it("writes a row the SQL test can read: a retired state, a fraction, nulls", () => {
    expect(
      reviewCaseSqlRow({
        name: "x",
        current: { kind: "retired", retiredHour: 1 },
        where: "review",
        points: 0.5,
        maxPoints: 1,
        answeredHour: 2,
        expected: null,
      }),
    ).toBe("('review case: x', null, null, 1, true, 0.5, 1, 2, null, null, null)");
  });
});
