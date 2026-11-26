/**
 * One table of ADR 0019 cases, pinned against both copies of the schedule (#627): the TS rules in
 * `src/lib/ngn/reviewSchedule.ts`, by `reviewCases.test.ts`, and the database's
 * `private.review_next` (20261126000400_review_entries.sql), by
 * `supabase/tests/database/review_entries.test.sql`, which holds the same rows as SQL. The TS test
 * reads that file and fails unless it holds exactly these rows, so the two copies cannot drift
 * apart without a test going red on one side.
 *
 * Times are whole hours after `REVIEW_CASE_BASE`, so every row reads the same in both languages.
 */
import type { ReviewGap } from "@/lib/ngn/reviewSchedule";

/** 2026-01-01T00:00:00Z, the SQL side's `'2026-01-01 00:00:00+00'`. */
export const REVIEW_CASE_BASE = Date.UTC(2026, 0, 1);
export const HOUR_MS = 60 * 60 * 1000;

/** A state as hours: waiting (gap and due), retired, or never in review (`null`). */
export type CaseState =
  | { kind: "waiting"; gapDays: ReviewGap; dueHour: number }
  | { kind: "retired"; retiredHour: number }
  | null;

export interface ReviewCase {
  name: string;
  current: CaseState;
  where: "review" | "elsewhere";
  points: number;
  maxPoints: number;
  answeredHour: number;
  expected: CaseState;
}

const waiting = (gapDays: ReviewGap, dueHour: number): CaseState => ({
  kind: "waiting",
  gapDays,
  dueHour,
});
const retired = (retiredHour: number): CaseState => ({ kind: "retired", retiredHour });

export const REVIEW_CASES: readonly ReviewCase[] = [
  {
    name: "a miss enters at 1 day",
    current: null,
    where: "elsewhere",
    points: 0,
    maxPoints: 1,
    answeredHour: 0,
    expected: waiting(1, 24),
  },
  {
    name: "full marks outside review never enters",
    current: null,
    where: "elsewhere",
    points: 1,
    maxPoints: 1,
    answeredHour: 0,
    expected: null,
  },
  {
    name: "full marks in review on nothing stays out",
    current: null,
    where: "review",
    points: 1,
    maxPoints: 1,
    answeredHour: 0,
    expected: null,
  },
  {
    name: "a question worth nothing never enters",
    current: null,
    where: "elsewhere",
    points: 0,
    maxPoints: 0,
    answeredHour: 0,
    expected: null,
  },
  {
    name: "due at 1 day, full marks moves to 3",
    current: waiting(1, 24),
    where: "review",
    points: 1,
    maxPoints: 1,
    answeredHour: 24,
    expected: waiting(3, 96),
  },
  {
    name: "late at 3 days, the next gap counts from the answer",
    current: waiting(3, 96),
    where: "review",
    points: 1,
    maxPoints: 1,
    answeredHour: 100,
    expected: waiting(7, 268),
  },
  {
    name: "due at 7 days, full marks moves to 14",
    current: waiting(7, 268),
    where: "review",
    points: 2,
    maxPoints: 2,
    answeredHour: 268,
    expected: waiting(14, 604),
  },
  {
    name: "full marks at 14 days retires it",
    current: waiting(14, 604),
    where: "review",
    points: 1,
    maxPoints: 1,
    answeredHour: 610,
    expected: retired(610),
  },
  {
    name: "a miss in review goes back to 1 day",
    current: waiting(3, 96),
    where: "review",
    points: 0,
    maxPoints: 1,
    answeredHour: 100,
    expected: waiting(1, 124),
  },
  {
    name: "partial credit in review is a miss",
    current: waiting(1, 24),
    where: "review",
    points: 0.5,
    maxPoints: 1,
    answeredHour: 30,
    expected: waiting(1, 54),
  },
  {
    name: "full marks in review before due counts for nothing",
    current: waiting(3, 96),
    where: "review",
    points: 1,
    maxPoints: 1,
    answeredHour: 90,
    expected: waiting(3, 96),
  },
  {
    name: "a miss in review before due still goes back to 1 day",
    current: waiting(3, 96),
    where: "review",
    points: 0,
    maxPoints: 1,
    answeredHour: 90,
    expected: waiting(1, 114),
  },
  {
    name: "full marks elsewhere while due changes nothing",
    current: waiting(3, 96),
    where: "elsewhere",
    points: 1,
    maxPoints: 1,
    answeredHour: 100,
    expected: waiting(3, 96),
  },
  {
    name: "a miss elsewhere brings a retired question back",
    current: retired(610),
    where: "elsewhere",
    points: 0,
    maxPoints: 1,
    answeredHour: 700,
    expected: waiting(1, 724),
  },
  {
    name: "full marks in review keeps a retired question retired",
    current: retired(610),
    where: "review",
    points: 1,
    maxPoints: 1,
    answeredHour: 700,
    expected: retired(610),
  },
  {
    name: "a mark worth nothing leaves a waiting question",
    current: waiting(7, 268),
    where: "review",
    points: 0,
    maxPoints: 0,
    answeredHour: 300,
    expected: waiting(7, 268),
  },
  {
    name: "above the maximum is full marks",
    current: waiting(1, 24),
    where: "review",
    points: 2,
    maxPoints: 1,
    answeredHour: 24,
    expected: waiting(3, 96),
  },
];

const sqlOr = (value: number | null): string => (value === null ? "null" : String(value));

function stateColumns(state: CaseState): string {
  if (state === null) return "null, null, null";
  if (state.kind === "retired") return `null, null, ${state.retiredHour}`;
  return `${state.gapDays}, ${state.dueHour}, null`;
}

/**
 * The row as the SQL test writes it, without its trailing comma: name, current (gap, due hour,
 * retired hour), in review, points, maximum, answered hour, expected (gap, due hour, retired hour).
 */
export function reviewCaseSqlRow(c: ReviewCase): string {
  return [
    `('review case: ${c.name}'`,
    stateColumns(c.current),
    String(c.where === "review"),
    sqlOr(c.points),
    sqlOr(c.maxPoints),
    sqlOr(c.answeredHour),
    `${stateColumns(c.expected)})`,
  ].join(", ");
}
