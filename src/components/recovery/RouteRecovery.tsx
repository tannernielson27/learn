"use client";

import { Button } from "@/components/ui/Button";

export interface RouteRecoveryProps {
  /** What stopped working, in the reader's words. Never the error's own message. */
  headline: string;
  /** What is still true, and what Try again will do. */
  detail: string;
  /** The segment's `retry` from Next: asks the server for the page again, then re-renders it. */
  onRetry: () => void;
}

/**
 * What a route's `error.tsx` shows in place of the page that failed (#164).
 *
 * The same panel as the question renderer's own recovery (#54, `RendererRecovery`): a bordered
 * surface, the sentence in `ink-1`, the reassurance under it in `ink-2`, one Try again. It is only
 * ever handed copy, so nothing about the error itself — its message, its digest, a stack — can
 * reach a student. React already reports every caught error through console.error, so there is
 * no logging here either; the repo logs only on the server.
 *
 * The heading is an h1 because every boundary here replaces a whole page, heading and all; the
 * one layout above any of them (authoring's header) has no heading of its own.
 *
 * It arrives with `motion-enter` (opacity and an 8px lift, collapsed by reduced motion through the
 * tokens), so it reads as the page changing rather than flashing.
 */
export function RouteRecovery({ headline, detail, onRetry }: RouteRecoveryProps) {
  return (
    <section
      aria-labelledby="route-recovery-heading"
      className="motion-enter flex flex-col items-start gap-4 rounded-md border border-line bg-surface-1 p-5"
    >
      <h1 id="route-recovery-heading" className="font-read text-2xl break-words text-ink-1">
        {headline}
      </h1>
      {/* The alert is the sentence that says what to do, so a screen reader hears it at once; the
          heading is there for the page's outline, which lost its own heading with the page. */}
      <p role="alert" className="measure text-ink-2">
        {detail}
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </section>
  );
}
