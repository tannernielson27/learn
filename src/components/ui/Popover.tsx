import type { CSSProperties, ReactNode } from "react";

/** Which way the panel opens from its button. It flips when the window has no room that way. */
export type PopoverAlign = "end" | "start";

export interface PopoverProps {
  /** The panel's id. A prop rather than `useId`, so a server-rendered page can use it. */
  id: string;
  /** What the button says: "Filters", "More". */
  label: ReactNode;
  /** A fuller name than the words, for a button whose words lean on what sits beside it. */
  accessibleName?: string;
  /** The button's classes: `buttonClasses()` or a text link's. */
  buttonClassName: string;
  /**
   * `end` (the default): the panel's end edge lines up with the button's, so a button at the end
   * of a row opens inward. `start` for a button at the start of one.
   */
  align?: PopoverAlign;
  /** The panel's width; it is never wider than the window less its gutters. */
  width?: "sm" | "md";
  className?: string;
  children: ReactNode;
}

/** The panel's look, the same card the account menu opens. */
export const POPOVER_PANEL_CLASSES =
  "rounded-md border border-line bg-surface-1 p-3 text-ink-1 shadow-elevation-1";

const WIDTHS = {
  sm: "w-[min(16rem,calc(100vw-2rem))]",
  md: "w-[min(22rem,calc(100vw-2rem))]",
} as const;

// Under its button where anchor positioning is supported, or above it where there is more room
// there (the editor's bar on a phone), and toward the other side near an edge. Elsewhere the
// browser's own popover place, the middle of the window, which still works. The height is capped
// by the room on the chosen side (100% of the anchored area), or by the window without anchoring.
const PLACES: Record<PopoverAlign, string> = {
  end: "supports-[position-area:bottom]:[position-area:block-end_span-inline-start]",
  start: "supports-[position-area:bottom]:[position-area:block-end_span-inline-end]",
};
// It takes the side with more room and scrolls inside when it is taller than that side, so a tall
// panel never covers its own button.
const ANCHORED =
  "supports-[position-area:bottom]:inset-auto supports-[position-area:bottom]:m-0 " +
  "supports-[position-area:bottom]:my-1 " +
  "supports-[position-area:bottom]:[position-try-fallbacks:flip-block,flip-inline] " +
  "supports-[position-area:bottom]:[position-try-order:most-block-size]";

/**
 * A button and the panel it opens (#563), on the native `popover` attribute as the account menu
 * is: the browser puts the panel in the top layer, opens and closes it with Enter or Space, closes
 * it on Escape or a click outside, and returns focus to the button, with no script at all. The
 * panel holds ordinary links and controls, not an ARIA `menu`, so Tab works inside it as it does
 * everywhere else. Inside a form, its controls still belong to that form while it is closed.
 *
 * It fades in once (`motion-toast`, opacity only under reduced motion) and never loops.
 */
export function Popover({
  id,
  label,
  accessibleName,
  buttonClassName,
  align = "end",
  width = "md",
  className = "",
  children,
}: PopoverProps) {
  const anchor = `--${id}`;
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={accessibleName}
        className={buttonClassName}
        style={{ anchorName: anchor } as CSSProperties}
      >
        {label}
      </button>
      <div
        id={id}
        popover="auto"
        data-popover-panel=""
        className={`motion-toast max-h-[min(36rem,calc(100%-0.5rem))] overflow-y-auto ${WIDTHS[width]} ${PLACES[align]} ${ANCHORED} ${POPOVER_PANEL_CLASSES} ${className}`.trim()}
        style={{ positionAnchor: anchor } as CSSProperties}
      >
        {children}
      </div>
    </>
  );
}
