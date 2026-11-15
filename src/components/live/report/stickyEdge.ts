/**
 * The class a report table's sticky first column wears (#563): it stays put on the surface the
 * rows scroll under, and draws a line at its edge once columns have passed under it (the
 * `data-scrolled` that `ScrollRegion` sets). Here, not in `ScrollRegion`: a value exported from a
 * "use client" module reaches a Server Component as a reference, not as the string.
 */
export const STICKY_EDGE =
  "sticky left-0 bg-surface-1 group-data-scrolled/scroll:shadow-[inset_-1px_0_0_var(--color-line-strong)]";
