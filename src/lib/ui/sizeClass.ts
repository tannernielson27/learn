/**
 * Window size classes (docs/ui-overhaul/PLAN.md §4 and §6), from Material 3's adaptive layout
 * guidance: a layout per class, not one layout stretched.
 *
 * - width: compact < 600, medium 600–839, expanded 840–1199, large 1200–1599, extra-large ≥ 1600
 * - height: compact < 480 (a phone on its side), medium 480–899, expanded ≥ 900
 *
 * CSS should reach for container queries and the Tailwind breakpoints first; this is for the few
 * places a component has to choose in script, such as which of two trees to render.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */

export type WidthClass = "compact" | "medium" | "expanded" | "large" | "extraLarge";
export type HeightClass = "compact" | "medium" | "expanded";

export interface SizeClass {
  width: WidthClass;
  height: HeightClass;
  /** Height under 480: the landscape phone, where the header collapses and Submit moves aside. */
  compactHeight: boolean;
}

/** The smallest width, in CSS pixels, each class starts at. */
export const WIDTH_CLASS_MIN: Readonly<Record<WidthClass, number>> = {
  compact: 0,
  medium: 600,
  expanded: 840,
  large: 1200,
  extraLarge: 1600,
};

/** The smallest height, in CSS pixels, each class starts at. */
export const HEIGHT_CLASS_MIN: Readonly<Record<HeightClass, number>> = {
  compact: 0,
  medium: 480,
  expanded: 900,
};

/** The largest class whose start is at or under `size`. Anything unmeasurable is the first. */
function classFor<T extends string>(size: number, mins: Readonly<Record<T, number>>, first: T): T {
  if (!Number.isFinite(size)) return first;
  let found = first;
  for (const [name, min] of Object.entries(mins) as [T, number][]) {
    if (size >= min) found = name;
  }
  return found;
}

export function widthClass(width: number): WidthClass {
  return classFor(width, WIDTH_CLASS_MIN, "compact");
}

export function heightClass(height: number): HeightClass {
  return classFor(height, HEIGHT_CLASS_MIN, "compact");
}

export function sizeClass(width: number, height: number): SizeClass {
  const vertical = heightClass(height);
  return { width: widthClass(width), height: vertical, compactHeight: vertical === "compact" };
}
