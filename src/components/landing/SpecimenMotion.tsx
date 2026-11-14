"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** How much of the specimen must be on screen before it plays. */
const THRESHOLD = 0.35;

/**
 * Plays the live session specimen once, when it is scrolled into view (#563). Every moving part
 * carries `data-cue`; the CSS in globals.css hides them while this is `armed` and plays them, on
 * transform and opacity only, once it is `playing`. All of it is over in under 2.5 seconds, so
 * there is nothing to pause.
 *
 * `still` is the finished picture, and it is what the server draws, so the specimen is whole
 * without JavaScript, under reduced motion, without IntersectionObserver, and when it is already
 * on screen as the page arrives (it is never blanked to be played). The state is written on the
 * element, not kept in React: it changes how the picture is drawn and nothing else.
 */
export function SpecimenMotion({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;

    element.dataset.specimen = "armed";
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        element.dataset.specimen = "playing";
        observer.disconnect();
      },
      { threshold: THRESHOLD },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} data-specimen="still" className={className}>
      {children}
    </div>
  );
}
