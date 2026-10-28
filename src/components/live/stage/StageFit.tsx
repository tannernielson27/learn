"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { bestFit, fitPlacement, layoutWidths, type Box, type Placement } from "./stageFit";

export interface StageFitProps {
  children: ReactNode;
  /**
   * How far the view may grow past its laid-out size. 1 for a view already drawn in the stage
   * ladder (the results chart), which only ever shrinks; more for one drawn at app sizes (a
   * renderer), which grows until it reads from the back row.
   */
  maxScale?: number;
  /** The narrowest width, in CSS pixels, to lay the view out at before it is scaled. */
  minWidth?: number;
  className?: string;
}

const STILL: Placement & { width: number | null } = { scale: 1, x: 0, width: null };

/**
 * A view fitted to its part of the projector (feat/stage-answer-key): scaled from the top left and
 * centred across until the whole of it is on the wall (`fitPlacement`). A view that may grow is
 * first laid out at the width, of a few (`layoutWidths`), that draws it biggest (`bestFit`). The stage is a fixed wall with no scroll, so a matrix of many rows or a
 * bowtie with its choices shrinks to fit rather than being cut off.
 *
 * Measured in one pass before paint, and again when the frame or the view changes size (a
 * renderer arriving from its own chunk, a web font landing). The pass writes only the transform
 * and the layout width; a transform never changes a layout size, and the width a pass settles on
 * is the one the next pass picks again, so it settles. Transform only, and nothing animates.
 */
export function StageFit({ children, maxScale = 1, minWidth = 0, className = "" }: StageFitProps) {
  const frame = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(STILL);

  useLayoutEffect(() => {
    const box = frame.current;
    const content = view.current;
    if (!box || !content) return;
    const size = (): Box => ({
      width: Math.max(content.offsetWidth, content.scrollWidth),
      height: Math.max(content.offsetHeight, content.scrollHeight),
    });
    const measure = () => {
      const frameBox = { width: box.clientWidth, height: box.clientHeight };
      let placed: Placement & { width: number | null };
      if (maxScale > 1) {
        // Each width is laid out and measured in turn, then the best is written back.
        const widths = layoutWidths(frameBox.width, maxScale, minWidth);
        placed = bestFit(frameBox, widths, maxScale, (width) => {
          content.style.width = `${width}px`;
          return size();
        });
        content.style.width = `${placed.width}px`;
      } else {
        placed = { ...fitPlacement(frameBox, size(), maxScale), width: null };
      }
      setFit((was) =>
        was.scale === placed.scale && was.x === placed.x && was.width === placed.width
          ? was
          : placed,
      );
    };
    measure();
    let next = 0;
    const again = () => {
      cancelAnimationFrame(next);
      next = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(again);
    observer?.observe(box);
    observer?.observe(content);
    const fonts = document.fonts as FontFaceSet | undefined;
    fonts?.addEventListener?.("loadingdone", again);
    return () => {
      cancelAnimationFrame(next);
      observer?.disconnect();
      fonts?.removeEventListener?.("loadingdone", again);
    };
  }, [maxScale, minWidth]);

  return (
    <div ref={frame} data-testid="stage-fit" className={`relative overflow-hidden ${className}`}>
      <div
        ref={view}
        data-testid="stage-fit-view"
        className={`absolute top-0 left-0 origin-top-left ${fit.width === null ? "w-full" : ""}`}
        style={{
          width: fit.width === null ? undefined : `${fit.width}px`,
          transform:
            fit.scale === 1 && fit.x === 0
              ? undefined
              : `translate(${fit.x}px, 0) scale(${fit.scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
