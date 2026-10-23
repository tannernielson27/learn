import type { ReactNode } from "react";

export interface PageWidthProps {
  /** `wide` is the 75rem of tables, reports and two-pane pages; `full` takes the whole window. */
  width: "wide" | "full";
  children: ReactNode;
  className?: string;
}

const WIDTHS = {
  // The window less the shell's 1rem gutters, up to the token width; centred on the column.
  wide: "w-[min(100vw-2rem,var(--content-wide))] ml-[calc(50%-min(50vw-1rem,var(--content-wide)/2))]",
  full: "w-[calc(100vw-2rem)] ml-[calc(50%-50vw+1rem)]",
} as const;

/**
 * A page that needs more room than the shell's reading column, without changing the layout every
 * other page shares (PLAN §6): it widens itself from the inside, centred on the column it is in.
 * Its edges stay 1rem inside the window, so a scrollbar never makes the page scroll sideways.
 */
export function PageWidth({ width, children, className = "" }: PageWidthProps) {
  return <div className={`max-w-none ${WIDTHS[width]} ${className}`.trim()}>{children}</div>;
}
