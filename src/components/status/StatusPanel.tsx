"use client";

import { useId, type ReactNode } from "react";
import { FocusHeading } from "./FocusHeading";

export interface StatusPanelProps {
  /** What happened, in the reader's words. Never an error's own message. */
  headline: string;
  children: ReactNode;
}

/**
 * The one surface every "this did not work" page shares (#164, #267): the not-found page, the
 * root error page and every route's error boundary. A bordered panel on the page surface, the
 * headline as a focused h1, and whatever the page says and offers under it.
 *
 * It arrives with `motion-enter` (opacity and an 8px lift, collapsed by reduced motion through the
 * tokens), so it reads as the page changing rather than flashing.
 */
export function StatusPanel({ headline, children }: StatusPanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="motion-enter flex flex-col items-start gap-4 rounded-md border border-line bg-surface-1 p-5"
    >
      <FocusHeading
        id={headingId}
        className="font-read text-2xl break-words text-ink-1 outline-none"
      >
        {headline}
      </FocusHeading>
      {children}
    </section>
  );
}
