import type { ReactNode } from "react";

export interface SkeletonProps {
  /** Size and spacing: give it the height of the line it stands in for, so nothing shifts. */
  className?: string;
}

/** The pulse: opacity only, plain CSS with no script, and still under reduced motion. */
export const SKELETON_PULSE = "animate-pulse motion-reduce:animate-none";

/**
 * One neutral block standing in for a line of a page that is still on its way. The secondary
 * surface, no text and no accent: a skeleton is not a selection, a focus or an action. Every block
 * starts its pulse with the screen, so they pulse together; a real heading beside them holds still.
 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-sm bg-surface-2 ${SKELETON_PULSE} ${className}`.trim()}
    />
  );
}

export interface SkeletonLineProps {
  /** The line box: the text's own line height, e.g. `h-5` for `text-sm`. */
  lineClassName: string;
  /** The block inside it, shorter than the line so stacked lines read as lines, not a slab. */
  className: string;
}

/** A block centred in a line box of the text's own height, so stacked lines keep their rhythm. */
export function SkeletonLine({ lineClassName, className }: SkeletonLineProps) {
  return (
    <div className={`flex items-center ${lineClassName}`}>
      <Skeleton className={className} />
    </div>
  );
}

export interface SkeletonScreenProps {
  /** What a screen reader hears, e.g. "Loading live sessions". */
  label: string;
  children: ReactNode;
}

/**
 * A route's `loading.tsx` body: one status line for a screen reader, then the page's own shape.
 * The blocks hide themselves from assistive technology; the children may also hold the page's
 * real h1, so a loading screen still has its one heading (axe `page-has-heading-one`).
 */
export function SkeletonScreen({ label, children }: SkeletonScreenProps) {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div data-skeleton-blocks>{children}</div>
    </div>
  );
}
