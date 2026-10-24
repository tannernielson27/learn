/**
 * How the projector shows a question too long for its part of the wall (feat/stage-long-text):
 * first the stem steps down in size until it fits, never under a floor the back row still reads;
 * only a stem that still does not fit at the floor scrolls. It holds at the top, reads down at a
 * slow, steady pace, holds at the bottom, glides back to the top, and repeats. Every phone has the
 * whole text all along.
 *
 * Pure TypeScript: no React, Next or Supabase. `StageStemFit` measures and moves; this decides.
 */

/** Time to read the opening lines before anything moves. */
export const HOLD_TOP_MS = 6_000;
/** Time to finish the last lines before the text goes back to the top. */
export const HOLD_BOTTOM_MS = 4_000;

/** The reading pace, in pixels a second, whatever the line height. */
const MIN_SPEED = 25;
const MAX_SPEED = 40;
/** Lines a second: about a line and a half every two seconds, slow enough to read aloud. */
const LINES_PER_SECOND = 0.7;

/** The glide back to the top: eased, never a jump and never a second reading. */
const MIN_RETURN_MS = 1_200;
const MAX_RETURN_MS = 2_500;
/** The glide back runs this many times faster than the reading pace, within the bounds above. */
const RETURN_FASTER = 5;

/** Each step down is this share of the size before it. */
const STEP = 0.94;

/**
 * The floor in CSS pixels (measured 2026-10-24 in Chromium at 1280x720 and 1920x1080): 28px on a
 * 720px stage, the floor the stage ladder already gives its options (`--text-stage-option`,
 * 1.75rem), and a thirtieth of the height above that, 36px on a 1080px stage. A stem at the floor
 * is never smaller than the options under it on a 720p projector, and still above the 32px of a
 * label on a 1080p one.
 */
export function stemFloor(stageHeight: number, rootFontSize: number): number {
  return Math.max(1.75 * rootFontSize, stageHeight / 30);
}

export interface StemFit {
  /** The font size to draw the stem at, in CSS pixels. */
  size: number;
  /** Whether the stem fits at `size`; false only at the floor, where it scrolls. */
  fits: boolean;
}

/**
 * Steps the stem down from its natural size until `fits` says yes or the floor is reached. A stem
 * already under the floor is left as it is. `fits` is asked at most a dozen or so times.
 */
export function fitStemSize(
  natural: number,
  floor: number,
  fits: (size: number) => boolean,
): StemFit {
  if (fits(natural)) return { size: natural, fits: true };
  if (natural <= floor) return { size: natural, fits: false };
  let size = natural;
  while (size > floor) {
    size = Math.max(floor, size * STEP);
    if (fits(size)) return { size, fits: true };
  }
  return { size: floor, fits: false };
}

/** Pixels a second for a stem whose lines are `lineHeight` pixels apart. */
export function scrollSpeed(lineHeight: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, lineHeight * LINES_PER_SECOND));
}

export interface ScrollPlan {
  /** How far the text moves up to show its last line, in pixels. */
  distance: number;
  /** Pixels a second on the way down. */
  speed: number;
  holdTopMs: number;
  downMs: number;
  holdBottomMs: number;
  returnMs: number;
  /** One whole loop; the next starts at the top. */
  cycleMs: number;
}

/** The loop for a stem with `distance` pixels hidden at the floor, or null when none is hidden. */
export function scrollPlan(distance: number, lineHeight: number): ScrollPlan | null {
  if (!(distance > 0)) return null;
  const speed = scrollSpeed(lineHeight);
  const downMs = (distance / speed) * 1000;
  const returnMs = Math.min(MAX_RETURN_MS, Math.max(MIN_RETURN_MS, downMs / RETURN_FASTER));
  return {
    distance,
    speed,
    holdTopMs: HOLD_TOP_MS,
    downMs,
    holdBottomMs: HOLD_BOTTOM_MS,
    returnMs,
    cycleMs: HOLD_TOP_MS + downMs + HOLD_BOTTOM_MS + returnMs,
  };
}

export type ScrollPhase = "holdTop" | "down" | "holdBottom" | "return";

/** Eased in and out, so the glide back starts and lands softly. */
const easeInOut = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;

/** How far up the text is, `elapsedMs` after the question came up, and which part of the loop. */
export function scrollAt(
  plan: ScrollPlan,
  elapsedMs: number,
): { offset: number; phase: ScrollPhase } {
  let t = Math.max(0, elapsedMs) % plan.cycleMs;
  if (t < plan.holdTopMs) return { offset: 0, phase: "holdTop" };
  t -= plan.holdTopMs;
  if (t < plan.downMs) return { offset: (t / plan.downMs) * plan.distance, phase: "down" };
  t -= plan.downMs;
  if (t < plan.holdBottomMs) return { offset: plan.distance, phase: "holdBottom" };
  t -= plan.holdBottomMs;
  return { offset: plan.distance * (1 - easeInOut(t / plan.returnMs)), phase: "return" };
}
