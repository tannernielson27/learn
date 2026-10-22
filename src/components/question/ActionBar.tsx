import type { ReactNode } from "react";

export interface ActionBarProps {
  children: ReactNode;
  /** Extra classes for the row inside, e.g. to stack it. */
  className?: string;
}

/**
 * The bar a player's main action sits in (PLAN §6, D7, D15): a solid surface, never blurred.
 *
 * - On a phone it is fixed to the bottom edge with the safe area, in thumb reach.
 * - From 768px it sticks to the bottom of its own column, so beside a patient record it is as wide
 *   as the question and never covers the record.
 * - On a phone on its side (`short:`) it is a slim column at the bottom of the right-hand edge, so
 *   the question keeps the whole height. Whatever holds it leaves room (`short:pr-36`).
 *
 * A control scrolled into view is never left under it (WCAG 2.4.11): the page's
 * `scroll-padding-bottom` is taller than the bar.
 */
export function ActionBar({ children, className = "" }: ActionBarProps) {
  return (
    // z-1: a disabled button after this in the page (opacity-50 makes it a stacking context)
    // would otherwise paint over the bar and swallow a tap. It stays under the record's drawer
    // (z-2) and sheet (z-5).
    <div
      data-submit-bar=""
      className="fixed inset-x-0 bottom-0 z-1 border-t border-line bg-surface-1 px-4 pt-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] md:sticky md:inset-x-auto md:mt-8 md:px-0 short:fixed short:top-auto short:right-0 short:bottom-0 short:left-auto short:mt-0 short:w-36 short:rounded-tl-md short:border-l short:px-3"
    >
      <div
        className={`mx-auto flex max-w-(--content-reading) items-center justify-between gap-3 short:flex-col short:items-stretch ${className}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}
