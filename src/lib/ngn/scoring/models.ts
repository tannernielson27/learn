import type { ScorableElement, ScoreBreakdownEntry, ScoreResult } from "../types";

/**
 * 0/1 scoring: each element earns 1 if correct, else 0. Score = sum.
 */
export function scoreZeroOne(elements: readonly ScorableElement[]): ScoreResult {
  const breakdown: ScoreBreakdownEntry[] = elements.map((e) => ({
    elementId: e.id,
    label: e.label,
    correct: e.correct,
    delta: e.correct ? 1 : 0,
  }));
  return {
    model: "zero_one",
    maxPoints: elements.length,
    points: breakdown.reduce((sum, b) => sum + b.delta, 0),
    breakdown,
  };
}

export interface PlusMinusInput {
  /** Ids the candidate selected. Duplicates are ignored. */
  selected: readonly string[];
  /** Ids that are correct. */
  correct: readonly string[];
  /** Optional labels for the breakdown. */
  labels?: Readonly<Record<string, string>>;
}

/**
 * +/- scoring: +1 per correct selection, -1 per incorrect selection, floored at 0.
 * Max = number of correct ids. Missed correct ids appear in the breakdown with delta 0
 * so feedback can show them, but they do not subtract.
 */
export function scorePlusMinus({ selected, correct, labels = {} }: PlusMinusInput): ScoreResult {
  const correctSet = new Set(correct);
  const selectedSet = new Set(selected);

  const selectedEntries: ScoreBreakdownEntry[] = [...selectedSet].map((id) => {
    const isCorrect = correctSet.has(id);
    return { elementId: id, label: labels[id], correct: isCorrect, delta: isCorrect ? 1 : -1 };
  });
  const missedEntries: ScoreBreakdownEntry[] = correct
    .filter((id) => !selectedSet.has(id))
    .map((id) => ({ elementId: id, label: labels[id], correct: false, delta: 0 }));

  const raw = selectedEntries.reduce((sum, b) => sum + b.delta, 0);
  return {
    model: "plus_minus",
    maxPoints: correctSet.size,
    points: Math.max(0, raw),
    breakdown: [...selectedEntries, ...missedEntries],
  };
}

export interface RationaleBlank {
  blankId: string;
  label?: string;
  correct: boolean;
}

/**
 * Rationale scoring.
 * Dyad (2 blanks): 1 point only if both are correct.
 * Triad (3 blanks): anchor must be correct; then each supporting blank earns 1. Anchor wrong = 0. Max 2.
 */
export function scoreRationale(
  blanks: readonly RationaleBlank[],
  anchorBlankId?: string,
): ScoreResult {
  if (blanks.length !== 2 && blanks.length !== 3) {
    throw new RangeError(`rationale scoring expects 2 or 3 blanks, got ${blanks.length}`);
  }
  const base = (b: RationaleBlank): ScoreBreakdownEntry => ({
    elementId: b.blankId,
    label: b.label,
    correct: b.correct,
    delta: 0,
  });

  if (blanks.length === 2) {
    const both = blanks.every((b) => b.correct);
    // The pair earns the point together, so the pair is the scored element. Split across the two
    // blanks, a breakdown shows a blank that was answered correctly sitting at zero.
    const labels = blanks.map((b) => b.label).filter((label) => label !== undefined);
    return {
      model: "rationale",
      maxPoints: 1,
      points: both ? 1 : 0,
      breakdown: [
        {
          elementId: blanks.map((b) => b.blankId).join("+"),
          label: labels.length === blanks.length ? labels.join(" and ") : undefined,
          correct: both,
          delta: both ? 1 : 0,
        },
      ],
    };
  }

  const anchorId = anchorBlankId ?? blanks[0].blankId;
  const anchor = blanks.find((b) => b.blankId === anchorId);
  if (!anchor) {
    throw new RangeError(`anchorBlankId ${anchorId} is not one of the blanks`);
  }
  const anchorCorrect = anchor.correct;
  const breakdown = blanks.map((b) => {
    if (b.blankId === anchorId) return base(b);
    return { ...base(b), delta: anchorCorrect && b.correct ? 1 : 0 };
  });
  return {
    model: "rationale",
    maxPoints: 2,
    points: breakdown.reduce((sum, b) => sum + b.delta, 0),
    breakdown,
  };
}

/** Combine per-row results of the same model into one item result. */
export function sumResults(
  model: ScoreResult["model"],
  parts: readonly ScoreResult[],
): ScoreResult {
  return {
    model,
    maxPoints: parts.reduce((s, p) => s + p.maxPoints, 0),
    points: parts.reduce((s, p) => s + p.points, 0),
    breakdown: parts.flatMap((p) => p.breakdown),
  };
}
