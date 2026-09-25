"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface FocusHeadingProps {
  children: ReactNode;
  id?: string;
  className?: string;
}

const BASE = "font-read text-3xl break-words text-ink-1 outline-none";

/**
 * The h1 of a page that exists to say something went wrong: a missing page, a failed render, a
 * dead link (#267). It takes focus when it appears, so a keyboard or screen reader user starts at
 * what happened rather than at the top of a page they did not expect. `tabIndex={-1}` makes it
 * focusable from script without adding a stop to the tab order; it is not interactive, so it
 * draws no focus ring.
 */
export function FocusHeading({ children, id, className = BASE }: FocusHeadingProps) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} id={id} tabIndex={-1} className={className}>
      {children}
    </h1>
  );
}
