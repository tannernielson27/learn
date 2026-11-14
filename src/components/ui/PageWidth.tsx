import type { ReactNode } from "react";

export interface PageWidthProps {
  /** `wide` is the 75rem of tables, reports and two-pane pages; `full` takes the whole window. */
  width: "wide" | "full";
  children: ReactNode;
  className?: string;
}

const WIDTHS = {
  // The window less the shell's gutters (`--shell-gutter`: 16px, 24px from 640px, 32px from
  // 1024px), up to the token width; centred on the column.
  wide:
    "w-[min(100vw-2*var(--shell-gutter,1rem),var(--content-wide))] " +
    "ml-[calc(50%-min(50vw-var(--shell-gutter,1rem),var(--content-wide)/2))]",
  full: "w-[calc(100vw-2*var(--shell-gutter,1rem))] ml-[calc(50%-50vw+var(--shell-gutter,1rem))]",
} as const;

/**
 * A page that needs more room than the shell's reading column, without changing the layout every
 * other page shares (PLAN §6): it widens itself from the inside, centred on the column it is in.
 * Its edges stay the shell's gutter inside the window, so a scrollbar never makes the page scroll sideways.
 */
export function PageWidth({ width, children, className = "" }: PageWidthProps) {
  return <div className={`max-w-none ${WIDTHS[width]} ${className}`.trim()}>{children}</div>;
}
