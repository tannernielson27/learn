/**
 * How a view too big or too small for its part of the projector is fitted to it
 * (feat/stage-answer-key): laid out at a width of its own, then scaled with a transform until the
 * whole of it is on the wall, never past a cap. Scaling keeps every row of a long matrix or a
 * bowtie and its choices in proportion, where cutting would lose the key.
 *
 * Pure TypeScript: no React, Next or Supabase. `StageFit` measures and draws; this decides.
 */

export interface Box {
  width: number;
  height: number;
}

export interface Placement {
  /** The transform's scale: under 1 to fit, over 1 (up to the cap) to be read from the back. */
  scale: number;
  /** How far to move the scaled view in from the left, so it sits in the middle of the frame. */
  x: number;
}

/**
 * The scale that puts the whole of `content` inside `frame`, capped at `maxScale`, and the shift
 * that centres it across. A box with no size (hidden, or not laid out yet) is left alone.
 */
export function fitPlacement(frame: Box, content: Box, maxScale: number): Placement {
  if (frame.width <= 0 || frame.height <= 0 || content.width <= 0 || content.height <= 0) {
    return { scale: 1, x: 0 };
  }
  const scale = Math.min(maxScale, frame.width / content.width, frame.height / content.height);
  return { scale, x: Math.max(0, (frame.width - content.width * scale) / 2) };
}

/** How many widths `layoutWidths` offers between its narrowest and the frame's own width. */
const WIDTH_STEPS = 4;

/**
 * The widths to try laying a view out at, narrowest first: from what the frame holds at the cap
 * (never under `floor`, the width the renderers' wide forms are drawn for) up to the frame's own
 * width. A narrow layout reads bigger; a wide one is shorter, which wins on a wall whose height is
 * what runs out (a bowtie with its choices under it, a long stem above a table).
 */
export function layoutWidths(frameWidth: number, maxScale: number, floor: number): number[] {
  const narrowest = Math.max(floor, frameWidth / maxScale);
  const widest = Math.max(narrowest, frameWidth);
  const widths: number[] = [];
  for (let step = 0; step < WIDTH_STEPS; step += 1) {
    const width = Math.round(narrowest + ((widest - narrowest) * step) / (WIDTH_STEPS - 1));
    if (!widths.includes(width)) widths.push(width);
  }
  return widths;
}

/**
 * The width, of `widths`, at which the view is drawn the biggest, with its placement. `measure`
 * lays the view out at a width and says how big it is then; the first of equals wins, so a
 * view that reads the same either way keeps the narrowest layout.
 */
export function bestFit(
  frame: Box,
  widths: readonly number[],
  maxScale: number,
  measure: (width: number) => Box,
): Placement & { width: number } {
  let best: (Placement & { width: number }) | null = null;
  for (const width of widths) {
    const placed = fitPlacement(frame, measure(width), maxScale);
    if (best === null || placed.scale > best.scale + 1e-6) best = { ...placed, width };
  }
  return best ?? { scale: 1, x: 0, width: widths[0] ?? 0 };
}
