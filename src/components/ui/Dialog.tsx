"use client";

import { useEffect, useId, useRef, type ReactNode, type SyntheticEvent } from "react";
import { Button } from "./Button";

/**
 * The stepped layout: a count, Back, Next and Skip. The caller holds the step number, swaps the
 * dialog's title and children to match it, and decides what Skip and the last button do.
 */
export interface DialogSteps {
  /** The step on screen, counted from 1. */
  current: number;
  total: number;
  onNext: () => void;
  onBack: () => void;
  /** The last step's button calls this instead of `onNext`. */
  onFinish: () => void;
  /** The last step's button, in the caller's words: "Get started". */
  finishLabel: string;
  /** Skip is offered on every step when this is given, and not at all when it is not. */
  onSkip?: () => void;
}

interface DialogBaseProps {
  open: boolean;
  /**
   * The close button, Escape, or the browser closing the dialog for its own reasons. The dialog
   * never closes itself: it stays up until `open` is false.
   */
  onClose: () => void;
  /** The heading, and the dialog's accessible name. */
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export type DialogProps = DialogBaseProps &
  (
    | { steps?: undefined; /** Buttons for the foot of a plain dialog. */ actions?: ReactNode }
    | { steps: DialogSteps; actions?: undefined }
  );

// A sheet off the bottom edge on a phone; a centred card from 768px. Preflight zeroes the margin
// a <dialog> centres itself with, so each shape sets its own. `open:flex`, never a bare `flex`:
// a display set outright would show the dialog while it is closed.
const frame =
  "motion-dialog fixed inset-0 m-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col overflow-hidden " +
  "rounded-t-md border-t border-line bg-surface-1 p-0 text-ink-1 open:flex " +
  "[padding-bottom:env(safe-area-inset-bottom)] backdrop:bg-ink-1/25 " +
  "md:m-auto md:max-h-[min(85dvh,40rem)] md:max-w-lg md:rounded-md md:border";

/**
 * The one popup in the system (#357), on the native `<dialog>` and `showModal()`. The browser
 * supplies what a hand-rolled modal has to fake: the page behind is inert, the dialog sits in the
 * top layer, and Tab stays with it without a key handler that could strand a keyboard user.
 *
 * Focus goes to the title on opening, so a screen reader starts at the top and the first Tab
 * lands on the close button, and returns to whatever opened the dialog on closing. Page scroll is
 * locked while it is up. Tapping the scrim does nothing: a welcome is shown once, and a stray tap
 * must not spend it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  steps,
  actions,
  className = "",
}: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const stepId = `${id}-step`;

  useEffect(() => {
    const el = dialog.current;
    if (!open || !el) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!el.open) el.showModal();
    heading.current?.focus();

    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    return () => {
      root.style.overflow = previousOverflow;
      if (el.open) el.close();
      // Browsers hand focus back on close(); doing it here as well covers an unmount.
      if (opener?.isConnected) opener.focus();
    };
  }, [open]);

  // Back is not drawn on the first step, so going back to it takes the focused button away.
  // Focus then falls out of the dialog; put it on the way forward.
  const current = steps ? Math.min(Math.max(steps.current, 1), steps.total) : 0;
  useEffect(() => {
    const el = dialog.current;
    if (!open || !el || current === 0) return;
    if (el.contains(document.activeElement)) return;
    el.querySelector<HTMLElement>("[data-dialog-forward]")?.focus();
  }, [open, current]);

  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    // Escape asks; the caller answers by clearing `open`.
    event.preventDefault();
    onClose();
  };

  // A close this component did not ask for: a `method="dialog"` form inside it, or a browser
  // that stops honouring a prevented Escape. Our own close() runs after `open` is already false.
  const onNativeClose = (event: SyntheticEvent<HTMLDialogElement>) => {
    if (open && !event.currentTarget.open) onClose();
  };

  const describedBy = [steps ? stepId : null, description ? descriptionId : null]
    .filter(Boolean)
    .join(" ");
  const last = steps !== undefined && current === steps.total;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={describedBy || undefined}
      onCancel={onCancel}
      onClose={onNativeClose}
      className={`${frame} ${className}`.trim()}
    >
      <header className="flex items-start gap-2 pt-3 pr-2 pl-4 md:pt-4 md:pr-3 md:pl-6">
        <div className="min-w-0 flex-1 pt-2">
          {steps ? (
            <p id={stepId} role="status" className="eyebrow mb-1">
              Step {current} of {steps.total}
            </p>
          ) : null}
          <h2
            id={titleId}
            ref={heading}
            tabIndex={-1}
            className="text-xl leading-snug font-semibold"
          >
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-ink-2">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="tap-target inline-flex shrink-0 items-center justify-center rounded-sm text-ink-2 transition-[background-color,color] duration-fast ease-out-expo hover:bg-surface-2 hover:text-ink-1"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </header>

      {children ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-5 md:px-6">{children}</div>
      ) : (
        <div className="pb-4" />
      )}

      {steps ? (
        <footer className="flex items-center gap-2 border-t border-line px-4 py-3 md:px-6">
          {steps.onSkip ? (
            <Button variant="ghost" className="-ml-3" onClick={steps.onSkip}>
              Skip
            </Button>
          ) : null}
          <span className="flex-1" />
          {current > 1 ? <Button onClick={steps.onBack}>Back</Button> : null}
          <Button
            data-dialog-forward=""
            variant="primary"
            onClick={last ? steps.onFinish : steps.onNext}
          >
            {last ? steps.finishLabel : "Next"}
          </Button>
        </footer>
      ) : actions ? (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3 md:px-6">
          {actions}
        </footer>
      ) : null}
    </dialog>
  );
}
