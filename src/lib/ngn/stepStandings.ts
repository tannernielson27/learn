/**
 * A student's clinical judgment steps (#239): how much of what was on offer they earned at each
 * CJMM step (docs/01-NGN-ITEM-SPEC.md §1), weakest first. Pure: no React, no Next, no Supabase.
 *
 * It is handed marks that are already scored and already chosen: the caller decides which answers
 * count (for an assignment, the best attempt once it has closed; for practice, #241, its own rule).
 * Each mark says where it came from, so the two sources can be shown apart while the ranking uses
 * both together.
 *
 * A step is ranked once it has `MIN_ITEMS_TO_RANK` items behind it and they were worth something;
 * the ranked steps come first, lowest percent first, a tie going to the step that comes first in
 * the model. The rest follow in the model's order. An item with no step (or one that is not 1-6)
 * is counted under "untagged" and never ranked.
 */
import { CJMM_STEP_LABELS, type CjmmStep } from "./types";

/** Where a mark came from: a closed assignment, or (#241) practice. */
export const STEP_SOURCES = ["assignments", "practice"] as const;
export type StepSource = (typeof STEP_SOURCES)[number];

/** Owner decision (S10 kickoff 4): a step needs this many items before it is ranked. */
export const MIN_ITEMS_TO_RANK = 5;

export interface StepMark {
  source: StepSource;
  /** The item's step as stored; anything that is not 1-6 counts as untagged. */
  cjmmStep: number | null;
  points: number;
  maxPoints: number;
}

export interface StepTally {
  items: number;
  points: number;
  maxPoints: number;
}

export interface SourcedTally extends StepTally {
  bySource: Record<StepSource, StepTally>;
}

export interface StepStanding extends SourcedTally {
  step: CjmmStep;
  label: string;
  /** 0-100, or null when the items were worth nothing (or there are none). */
  percent: number | null;
  /** Enough items to be ranked, and worth something. */
  ranked: boolean;
}

export interface StepStandings {
  /** All six steps: the ranked ones weakest first, then the rest in the model's order. */
  steps: StepStanding[];
  untagged: SourcedTally;
}

const STEPS: readonly CjmmStep[] = [1, 2, 3, 4, 5, 6];

const EMPTY: StepTally = { items: 0, points: 0, maxPoints: 0 };

const isStep = (value: number | null): value is CjmmStep =>
  value !== null && (STEPS as readonly number[]).includes(value);

/** A score the engine could have given: finite, not negative, and no more than was on offer. */
const isRealScore = (mark: StepMark): boolean =>
  Number.isFinite(mark.points) &&
  Number.isFinite(mark.maxPoints) &&
  mark.points >= 0 &&
  mark.points <= mark.maxPoints;

const add = (tally: StepTally, mark: StepMark): StepTally => ({
  items: tally.items + 1,
  points: tally.points + mark.points,
  maxPoints: tally.maxPoints + mark.maxPoints,
});

function tallyOf(marks: readonly StepMark[]): SourcedTally {
  const bySource = Object.fromEntries(
    STEP_SOURCES.map((source) => [
      source,
      marks.filter((mark) => mark.source === source).reduce(add, EMPTY),
    ]),
  ) as Record<StepSource, StepTally>;
  return { ...marks.reduce(add, EMPTY), bySource };
}

function standingOf(step: CjmmStep, marks: readonly StepMark[]): StepStanding {
  const tally = tallyOf(marks.filter((mark) => mark.cjmmStep === step));
  const percent = tally.maxPoints > 0 ? (tally.points / tally.maxPoints) * 100 : null;
  return {
    step,
    label: CJMM_STEP_LABELS[step],
    ...tally,
    percent,
    ranked: percent !== null && tally.items >= MIN_ITEMS_TO_RANK,
  };
}

/** Ranked first, weakest first; a tie, and everything unranked, in the model's order. */
function byWeakness(a: StepStanding, b: StepStanding): number {
  if (a.ranked !== b.ranked) return a.ranked ? -1 : 1;
  const byPercent = a.ranked && b.ranked ? (a.percent ?? 0) - (b.percent ?? 0) : 0;
  return byPercent || a.step - b.step;
}

export function buildStepStandings(marks: readonly StepMark[]): StepStandings {
  const real = marks.filter(isRealScore);
  return {
    steps: STEPS.map((step) => standingOf(step, real)).sort(byWeakness),
    untagged: tallyOf(real.filter((mark) => !isStep(mark.cjmmStep))),
  };
}
