import type { ReactNode } from "react";

export interface ReadingWidthProps {
  children: ReactNode;
  className?: string;
}

/**
 * The reading column (`--content-reading`, 48rem) inside the teacher area's wide shell (PLAN §6).
 * The author layout gives every page `wide`, for the pages with a rail, a table or two panes;
 * a page that is a form or a list of lines wraps itself in this, so its lines keep their measure.
 */
export function ReadingWidth({ children, className = "" }: ReadingWidthProps) {
  return <div className={`mx-auto w-full max-w-reading ${className}`.trim()}>{children}</div>;
}
