import type { CSSProperties, ReactNode } from "react";
import { PAGE_TITLE_CLASSES } from "./PageHeader";

export interface SkeletonProps {
  /** Size and spacing: give it the height of the line it stands in for, so nothing shifts. */
  className?: string;
  /**
   * No pulse: a plain block. For loading screens held to "nothing loops" (design doc §5), which
   * the overhaul's later routes use; the pulse stays the default for the screens that have it.
   */
  still?: boolean;
}

/** The pulse: opacity only, plain CSS with no script, and still under reduced motion. */
export const SKELETON_PULSE = "animate-pulse motion-reduce:animate-none";

/**
 * One neutral block standing in for a line of a page that is still on its way. The secondary
 * surface, no text and no accent: a skeleton is not a selection, a focus or an action. Every block
 * starts its pulse with the screen, so they pulse together; a real heading beside them holds still.
 */
export function Skeleton({ className = "", still = false }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-sm bg-surface-2 ${still ? "" : SKELETON_PULSE} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
    />
  );
}

export interface SkeletonLineProps {
  /** The line box: the text's own line height, e.g. `h-5` for `text-sm`. */
  lineClassName: string;
  /** The block inside it, shorter than the line so stacked lines read as lines, not a slab. */
  className: string;
  /** No pulse, as on `Skeleton`. */
  still?: boolean;
}

/** A block centred in a line box of the text's own height, so stacked lines keep their rhythm. */
export function SkeletonLine({ lineClassName, className, still = false }: SkeletonLineProps) {
  return (
    <div className={`flex items-center ${lineClassName}`}>
      <Skeleton className={className} still={still} />
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

export type SkeletonPageShape = "list" | "table";

export interface SkeletonPageProps {
  /** What a screen reader hears, e.g. "Loading the library". */
  label: string;
  /** `list`: a header over rows of a title and a line. `table`: a header over a table's rows. */
  shape: SkeletonPageShape;
  /**
   * The page's real title, when it is known before the data: it is drawn as the h1 it will be,
   * so the heading never jumps. Without one a block stands in for it.
   */
  title?: ReactNode;
  /** Whether the page has a main action beside its title. */
  action?: boolean;
  /** How many rows to draw; five by default, about a phone's first screen. */
  rows?: number;
  /** A table's columns from 640px; a phone shows the first two. Four by default. */
  columns?: number;
}

// Every block here holds still: a loading page never loops (docs/04 §5, §11 "Loading").
function Line({ line, block }: { line: string; block: string }) {
  return <SkeletonLine still lineClassName={line} className={block} />;
}

/**
 * A whole page that is still on its way (#563, docs/04 §11): `PageHeader`'s shape (the title in
 * the display size, a lead, and the main action), then a list or a table in the shape the page
 * will have, so nothing shifts when it arrives. Labelled for screen readers by one status line;
 * no block pulses, under reduced motion or otherwise.
 */
export function SkeletonPage({
  label,
  shape,
  title,
  action = false,
  rows = 5,
  columns = 4,
}: SkeletonPageProps) {
  const rowKeys = Array.from({ length: rows }, (_, index) => index);
  const columnKeys = Array.from({ length: Math.max(columns, 2) }, (_, index) => index);
  return (
    <SkeletonScreen label={label}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
        <div className="min-w-0 flex-1">
          {title ? (
            <h1 className={PAGE_TITLE_CLASSES}>{title}</h1>
          ) : (
            <Line line="h-[1.1em] text-section" block="h-[0.75em] w-2/3 max-w-sm" />
          )}
          <Line line="mt-3 h-7" block="h-4 w-full max-w-md" />
        </div>
        {action ? <Skeleton still className="h-(--button-height-md) w-36 rounded-md" /> : null}
      </div>
      {shape === "list" ? (
        <ul aria-hidden="true" className="mt-10 border-t border-line">
          {rowKeys.map((row) => (
            <li key={row} className="flex flex-col gap-1 border-b border-line py-4">
              <Line line="h-6" block={`h-4 ${row % 2 ? "w-2/5" : "w-3/5"}`} />
              <Line line="h-5" block="h-3.5 w-1/3" />
            </li>
          ))}
        </ul>
      ) : (
        <div aria-hidden="true" className="mt-10 border-t border-line">
          {[-1, ...rowKeys].map((row) => (
            <div
              key={row}
              data-skeleton-row={row < 0 ? "head" : "body"}
              className="grid grid-cols-2 gap-4 border-b border-line py-3.5 sm:grid-cols-(--skeleton-columns)"
              style={
                {
                  "--skeleton-columns": `repeat(${columnKeys.length}, minmax(0, 1fr))`,
                } as CSSProperties
              }
            >
              {columnKeys.map((column) => (
                // A phone has room for two columns; the rest join from 640px.
                <div key={column} className={column > 1 ? "hidden sm:block" : undefined}>
                  <Line
                    line="h-5"
                    block={row < 0 ? "h-3 w-16" : column === 0 ? "h-3.5 w-4/5" : "h-3.5 w-1/2"}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </SkeletonScreen>
  );
}
