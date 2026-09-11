"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

const FOCUSABLE =
  "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]";

/** Everything inside `root` a Tab press can reach: not in a hidden tab panel, not roved out. */
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.getAttribute("tabindex") !== "-1" && el.closest("[hidden]") === null,
  );
}

export interface EhrSheetProps {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The phone presentation of the record: a modal sheet off the bottom edge. It takes focus, keeps
 * Tab inside itself, closes on Escape or a tap outside, and the caller returns focus to the chip.
 */
export function EhrSheet({ label, onClose, children }: EhrSheetProps) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !dialog.current) return;
    const stops = focusables(dialog.current);
    event.preventDefault();
    if (stops.length === 0) return;
    const index = stops.indexOf(document.activeElement as HTMLElement);
    const next = event.shiftKey
      ? index <= 0
        ? stops.length - 1
        : index - 1
      : index === -1 || index === stops.length - 1
        ? 0
        : index + 1;
    stops[next]!.focus();
  };

  return (
    <div className="fixed inset-0 z-50">
      {/* Tapping the scrim closes the sheet; it is decoration, so the keyboard route out is Escape. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 w-full cursor-default bg-ink-1/25"
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] animate-[fade-up_var(--duration-base)_var(--ease-out-expo)_both] flex-col rounded-t-md border-t border-line bg-surface-1 [padding-bottom:env(safe-area-inset-bottom)]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-2">{children}</div>
        <div className="border-t border-line px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            className="tap-target inline-flex w-full items-center justify-center rounded-sm border border-line text-sm font-medium transition-colors duration-fast ease-out-expo hover:bg-surface-2"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
