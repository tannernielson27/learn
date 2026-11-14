"use client";

import { useEffect, useRef, type ReactNode } from "react";

export type MotionState = "waiting" | "played" | "still";

const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Plays the landing picture once, when it is first seen (#563). It only sets `data-motion` on a
 * wrapper; the picture itself is drawn on the server and the CSS (`.demo-*` in globals.css) does
 * the moving, transform and opacity only.
 *
 * - `waiting`: drawn by the server. The first frame is hidden only where scripts run and motion
 *   is welcome, so without JavaScript the last frame is what is seen.
 * - `played`: in view at least once, so the picture settles on its last frame and stays there.
 *   Nothing loops, and scrolling away and back does not play it again.
 * - `still`: reduced motion, or a browser without IntersectionObserver: the last frame at once.
 *
 * It carries no data of its own: its only props are the wrapper's classes and the children the
 * server drew. The state is written straight onto the wrapper rather than through React state:
 * the server's markup says `waiting`, React never writes the attribute again, and nothing else
 * on the page re-renders when the picture plays.
 */
export function PlayOnce({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const set = (state: MotionState) => {
      element.dataset.motion = state;
    };
    const reduced = typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches;
    if (reduced || typeof IntersectionObserver === "undefined") {
      set("still");
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        set("played");
        observer.disconnect();
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-motion={"waiting" satisfies MotionState} className={className}>
      {children}
    </div>
  );
}
