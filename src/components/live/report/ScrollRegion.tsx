"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

interface Edges {
  /** Columns have scrolled under the sticky first column. */
  scrolled: boolean;
  /** More columns wait past the right edge. */
  more: boolean;
}

/** A pixel of slack, so a fractional scroll position at either end still reads as the end. */
const SLACK = 1;

function edgesOf(box: HTMLElement): Edges {
  const max = box.scrollWidth - box.clientWidth;
  return { scrolled: box.scrollLeft > SLACK, more: box.scrollLeft < max - SLACK };
}

/**
 * A table that scrolls sideways inside its own box, never the page (#186's 375px criterion, #563).
 * Focusable and named, so a keyboard can scroll it with the arrow keys and axe's
 * scrollable-region rule holds.
 *
 * Two cues say there is more: while columns wait past the right edge, the edge fades into the
 * surface, and once columns have passed under the sticky first column, that column draws a line
 * at its edge (`STICKY_EDGE`, in ./stickyEdge). Each is a change of opacity or a line, never motion, and neither
 * plays at all on a table that fits. Without script, neither shows and the box still scrolls.
 *
 * The box is `relative`, so a screen-reader-only label inside a cell (absolutely placed) is
 * clipped by it rather than widening the page.
 *
 * No container-type on this box or around it: it would make the box the containing block of the
 * sticky first column (the lesson of #563's second PR).
 */
export function ScrollRegion({ label, children }: { label: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<Edges>({ scrolled: false, more: false });

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const update = () => {
      const next = edgesOf(element);
      setEdges((now) => (now.scrolled === next.scrolled && now.more === next.more ? now : next));
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    // The table's width changes with the window and with the fonts loading.
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    resize?.observe(element);
    if (element.firstElementChild) resize?.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", update);
      resize?.disconnect();
    };
  }, []);

  return (
    <div
      className="group/scroll relative"
      data-scrolled={edges.scrolled ? "" : undefined}
      data-more={edges.more ? "" : undefined}
    >
      <div
        ref={box}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="relative max-w-full overflow-x-auto rounded-sm border border-line bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        data-scroll-cue="more"
        className="pointer-events-none absolute inset-y-px right-px w-10 rounded-r-sm bg-linear-to-l from-surface-1 to-transparent opacity-0 transition-opacity duration-fast ease-out group-data-more/scroll:opacity-100 motion-reduce:transition-none"
      />
    </div>
  );
}
