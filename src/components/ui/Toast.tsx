"use client";

import { useEffect, useRef } from "react";

/** How long a toast stays: long enough to read "Saved", short enough not to cover anything. */
export const TOAST_MS = 4_000;

export interface ToastProps {
  /** What happened, in a few words: "Saved", "Copied", "Reconnected". Null shows nothing. */
  message: string | null;
  /** Called when the toast has been up for `duration`. The caller clears `message`. */
  onDismiss: () => void;
  duration?: number;
}

/** Whether this browser has the popover API (Baseline in every browser Next 16 supports). */
function canPop(el: HTMLElement | null): el is HTMLElement & {
  showPopover(): void;
  hidePopover(): void;
} {
  return el !== null && typeof (el as { showPopover?: unknown }).showPopover === "function";
}

/**
 * A short confirmation that something worked (PLAN §8). It sits in the top layer through the
 * native `popover` attribute, so no dialog or sticky bar covers it, and leaves by itself.
 *
 * Heard once: the words go into a polite live region that is always in the page (a region that
 * appears with its text is often not read), and the visible card is hidden from assistive
 * technology so they are not read twice. Never for errors: those stay on screen as a `Notice`
 * until they are dealt with.
 *
 * Motion: a fade and an 8px rise on opacity and transform, from the tokens, so reduced motion
 * leaves an 80ms fade.
 */
export function Toast({ message, onDismiss, duration = TOAST_MS }: ToastProps) {
  const card = useRef<HTMLDivElement>(null);
  // The latest callback, so a caller that passes a new function every render does not restart
  // the timer.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    const el = card.current;
    if (message === null) {
      if (canPop(el) && el.matches(":popover-open")) el.hidePopover();
      return;
    }
    if (canPop(el) && !el.matches(":popover-open")) el.showPopover();
    const handle = setTimeout(() => dismiss.current(), duration);
    return () => clearTimeout(handle);
  }, [message, duration]);

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
      <div
        ref={card}
        popover="manual"
        // Without the popover API the attribute does nothing, so an empty card would sit on screen.
        hidden={message === null}
        aria-hidden="true"
        data-testid="toast"
        className="motion-toast fixed inset-x-0 top-auto bottom-(--toast-offset) mx-auto w-fit max-w-[calc(100%-2rem)] rounded-md border border-line bg-surface-1 px-4 py-3 text-base font-semibold text-ink-1 shadow-elevation-1"
      >
        {message}
      </div>
    </>
  );
}
