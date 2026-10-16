import type { ReactNode } from "react";

export interface SkeletonProps {
  /** Size and spacing: give it the height of the line it stands in for, so nothing shifts. */
  className?: string;
}

/**
 * One neutral block standing in for a line of a page that is still on its way. The secondary
 * surface, no text and no accent: a skeleton is not a selection, a focus or an action.
 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div aria-hidden="true" className={`rounded-sm bg-surface-2 ${className}`.trim()} />;
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
  /** What a screen reader hears, e.g. "Loading live sessions". The only words on the screen. */
  label: string;
  children: ReactNode;
}

/**
 * A route's `loading.tsx` body: one status line for a screen reader and the blocks, drawn in the
 * page's own shape. The blocks share a single slow opacity pulse, plain CSS with no script, and
 * hold still under reduced motion.
 */
export function SkeletonScreen({ label, children }: SkeletonScreenProps) {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div
        data-skeleton-blocks
        aria-hidden="true"
        className="animate-pulse motion-reduce:animate-none"
      >
        {children}
      </div>
    </div>
  );
}
