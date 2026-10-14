"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { WelcomeStep } from "@/lib/onboarding/teacherWelcome";

export interface WelcomeDialogProps {
  steps: readonly WelcomeStep[];
  /** The last step's button, in the flow's own words. */
  finishLabel: string;
  /** Records that this account has seen the welcome, so it never shows again. */
  onDone: () => Promise<void>;
  /** The id of the element that takes focus once the welcome closes. */
  focusAfter: string;
}

/**
 * A welcome shown once to a new account, as steps in the stepped `Dialog`: the teacher's on the
 * author home (#364) and the student's on the student home (#365). The page decides whether it
 * shows; this draws it and records that it was seen.
 *
 * Finishing, Skip, the close button and Escape all end it the same way: it closes at once,
 * `onDone` is called in the background, and focus goes to `focusAfter`, which is what the last
 * step points at. Closing never waits on the server: if recording fails, the worst case is that
 * the welcome shows once more.
 */
export function WelcomeDialog({ steps, finishLabel, onDone, focusAfter }: WelcomeDialogProps) {
  const [open, setOpen] = useState(true);
  const [current, setCurrent] = useState(1);
  const [, startTransition] = useTransition();
  const ended = useRef(false);

  useEffect(() => {
    if (open || !ended.current) return;
    // After the Dialog has closed and let go of the page. The heading is not a tab stop.
    document.getElementById(focusAfter)?.focus();
  }, [open, focusAfter]);

  const step = steps[Math.min(current, steps.length) - 1];
  if (!step) return null;

  const end = () => {
    if (ended.current) return;
    ended.current = true;
    setOpen(false);
    startTransition(async () => {
      try {
        await onDone();
      } catch {
        // Nothing to show: the welcome is closed either way, and shows again if this did not land.
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={end}
      title={step.title}
      steps={{
        current,
        total: steps.length,
        onNext: () => setCurrent((n) => Math.min(n + 1, steps.length)),
        onBack: () => setCurrent((n) => Math.max(n - 1, 1)),
        onFinish: end,
        onSkip: end,
        finishLabel,
      }}
    >
      <div className="flex max-w-prose flex-col gap-3 text-ink-1">
        {step.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </Dialog>
  );
}
