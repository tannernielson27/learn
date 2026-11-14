"use client";

import { useEffect, useRef, type ReactNode } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

export interface PlayOnceProps {
  children: ReactNode;
  className?: string;
  /** How much of it must be on screen before it plays. */
  threshold?: number;
}

/**
 * Plays the steps inside it once, the first time it scrolls into view (#563). The server's HTML is
 * the last frame, so without JavaScript, under reduced motion, or in a browser with no
 * IntersectionObserver, the drawing is simply finished and nothing moves.
 *
 * Otherwise it marks itself `data-demo="ready"` (each `[data-demo-step]` held at its start, in
 * globals.css) and `play` once seen, then stops watching: nothing loops and nothing replays. The
 * attribute is written straight onto the element, not through state, so playing never re-renders.
 */
export function PlayOnce({ children, className, threshold = 0.35 }: PlayOnceProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof IntersectionObserver === "undefined") return;
    if (typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches) return;

    element.dataset.demo = "ready";
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        element.dataset.demo = "play";
        observer.disconnect();
      },
      { threshold },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      // Unmounted before it was seen: leave the last frame, never a held start.
      if (element.dataset.demo === "ready") delete element.dataset.demo;
    };
  }, [threshold]);

  return (
    <div ref={ref} className={className} data-testid="live-class-play">
      {children}
    </div>
  );
}
