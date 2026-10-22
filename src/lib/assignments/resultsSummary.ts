/**
 * The summary over a student's results (ResultsDesktop and ResultsPhone mockups): the total, the
 * share by clinical judgment step, and one row per question with its verdict. Shared by an
 * assignment's results and the end of a practice run. Nothing here scores anything: every number
 * is a mark the server already made, so this is safe in a student's bundle.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";

/** How one question stands, in the words the player's score panel uses. */
export type RowVerdict = "full" | "partial" | "none" | "unanswered" | "unreadable";

export interface ResultRow {
  /** The question's row id. */
  id: string;
  /** 1-based place in the set. */
  number: number;
  /** The question text, as plain as it is stored. */
  stem: string;
  step: CjmmStep | null;
  /** Null when there is no mark to read. */
  points: number | null;
  /** What the question was worth: its mark's maximum, or the item's own when unmarked. */
  maxPoints: number;
  verdict: RowVerdict;
}

/** A maximum above nought, reached: the player's "All correct" line. */
export const isFullMarks = ({ points, maxPoints }: { points: number; maxPoints: number }) =>
  maxPoints > 0 && points >= maxPoints;

export function verdictOf(
  points: number,
  maxPoints: number,
): Exclude<RowVerdict, "unanswered" | "unreadable"> {
  if (isFullMarks({ points, maxPoints })) return "full";
  return points > 0 ? "partial" : "none";
}

/** Whether a row counts as missed: anything short of full marks that can still be read. */
export const isMissedRow = (row: Pick<ResultRow, "verdict">): boolean =>
  row.verdict !== "full" && row.verdict !== "unreadable";

/** Two decimals at most, as the database stores them, without trailing zeros. */
export const formatPoints = (value: number): string => String(Math.round(value * 100) / 100);

const VERDICT_WORDS: Record<RowVerdict, string> = {
  full: "All correct",
  partial: "Partially correct",
  none: "Not correct",
  unanswered: "Not answered",
  unreadable: "Could not be shown",
};

/** "Partially correct · 2/3", or "Not answered · 0/1". */
export function verdictLine(row: ResultRow): string {
  const words = VERDICT_WORDS[row.verdict];
  if (row.verdict === "unreadable") return words;
  return `${words} · ${formatPoints(row.points ?? 0)}/${formatPoints(row.maxPoints)}`;
}

export interface Totals {
  points: number;
  maxPoints: number;
  /** Whole percent, 0 when nothing was worth anything. */
  percent: number;
  missed: number;
}

export function totalsOf(rows: readonly ResultRow[]): Totals {
  const points = rows.reduce((sum, row) => sum + (row.points ?? 0), 0);
  const maxPoints = rows.reduce((sum, row) => sum + row.maxPoints, 0);
  return {
    points,
    maxPoints,
    percent: maxPoints > 0 ? Math.round((points / maxPoints) * 100) : 0,
    missed: rows.filter(isMissedRow).length,
  };
}

export interface StepShare {
  step: CjmmStep;
  label: string;
  /** Whole percent of the step's points earned. */
  percent: number;
  questions: number;
}

/**
 * The share of points earned at each clinical judgment step, step 1 first, for the steps the set
 * has. A question with no step, or whose mark cannot be read, is left out.
 */
export function stepShares(rows: readonly ResultRow[]): StepShare[] {
  const byStep = new Map<CjmmStep, { points: number; maxPoints: number; questions: number }>();
  for (const row of rows) {
    if (row.step === null || row.verdict === "unreadable") continue;
    const held = byStep.get(row.step) ?? { points: 0, maxPoints: 0, questions: 0 };
    held.points += row.points ?? 0;
    held.maxPoints += row.maxPoints;
    held.questions += 1;
    byStep.set(row.step, held);
  }
  return [...byStep.entries()]
    .sort(([a], [b]) => a - b)
    .map(([step, held]) => ({
      step,
      label: CJMM_STEP_LABELS[step],
      percent: held.maxPoints > 0 ? Math.round((held.points / held.maxPoints) * 100) : 0,
      questions: held.questions,
    }));
}

/** The item fields a row is read from: its text, its step and what it is worth. */
interface RowItem {
  stem: { value: string };
  cjmmStep?: CjmmStep;
  scoring?: { maxPoints: number };
}

/** One question's row from a mark, or from no mark at all. */
export function rowOf(
  id: string,
  number: number,
  item: RowItem,
  mark: { points: number; maxPoints: number } | "unanswered" | "unreadable",
): ResultRow {
  const base = {
    id,
    number,
    stem: item.stem.value.replace(/\s+/g, " ").trim(),
    step: item.cjmmStep ?? null,
  };
  if (mark === "unanswered" || mark === "unreadable") {
    return { ...base, points: null, maxPoints: item.scoring?.maxPoints ?? 0, verdict: mark };
  }
  return { ...base, ...mark, verdict: verdictOf(mark.points, mark.maxPoints) };
}
