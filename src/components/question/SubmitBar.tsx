"use client";

import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ActionBar } from "./ActionBar";

export interface SubmitBarProps {
  /** Whether the current response is complete enough to submit. */
  canSubmit: boolean;
  onSubmit: () => void;
  /** A server is checking the answer: Submit stays in place, says so, and ignores presses. */
  submitting: boolean;
  busyLabel: string;
  /** Why the last check failed, shown in place of the status line. */
  submitError?: string;
  /** What the answer holds so far, e.g. "2 selected". Nothing is shown without one. */
  status?: string;
}

export const INCOMPLETE = "Complete the question to submit.";

/**
 * The one place Submit lives: an `ActionBar` with the status line ("2 selected", or nothing) and a
 * 56px Submit in thumb reach on a phone.
 */
export function SubmitBar({
  canSubmit,
  onSubmit,
  submitting,
  busyLabel,
  submitError,
  status,
}: SubmitBarProps) {
  const reasonId = useId();
  // aria-disabled is advisory: the browser still fires click (and Enter and Space) on the button,
  // so this is what actually keeps an incomplete or in-flight answer from being sent.
  const blocked = !canSubmit || submitting;
  // The reason is only rendered when there is no error in its place, so only then is it pointed to.
  const showReason = !submitError && !canSubmit;

  const submit = () => {
    if (blocked) return;
    onSubmit();
  };

  let line: ReactNode;
  if (submitError) {
    line = (
      <p role="alert" className="text-sm text-ink-1">
        {submitError}
      </p>
    );
  } else if (showReason) {
    line = (
      <span id={reasonId} className="text-sm text-ink-2">
        {INCOMPLETE}
      </span>
    );
  } else {
    // Not a live region: the controls already announce each change, and a renderer such as the
    // ordered response keeps the page's one status region for its own moves.
    line = status ? <span className="text-sm text-ink-2">{status}</span> : null;
  }

  return (
    <ActionBar>
      {/* min-h-5 holds the line's height while it is empty, so a count appearing moves nothing. */}
      <div className="min-h-5 min-w-0 flex-1 short:flex-none">{line}</div>
      {/* aria-disabled, never disabled (#59): a disabled button cannot take focus, so a screen
            reader never reaches the reason beside it. It stays focusable, says it is unavailable,
            is described by the reason, and `submit` ignores the press. The aria-disabled: classes
            repeat Button's disabled: look so nothing moves visually. */}
      <Button
        variant="primary"
        size="lg"
        type="button"
        aria-disabled={blocked ? true : undefined}
        aria-describedby={showReason ? reasonId : undefined}
        className="min-w-32 aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:bg-surface-2 aria-disabled:text-ink-2 md:min-w-40 short:min-w-0 short:px-2"
        onClick={submit}
      >
        {submitting ? busyLabel : "Submit"}
      </Button>
    </ActionBar>
  );
}
