"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * What a confirmed action reports back (#256). A failure carries a plain sentence for the person,
 * never the database's own text. Nothing at all counts as success, for actions that cannot fail.
 */
export type ConfirmOutcome = { ok: true } | { ok: false; message: string };

export interface ConfirmSubmitProps {
  /** A Server Function, already bound to what it acts on. */
  action: (formData: FormData) => Promise<ConfirmOutcome | void>;
  label: string;
  confirmLabel: string;
  /** What confirming will do, said before it happens. */
  warning: string;
  /** An accessible name for the first button when `label` alone is ambiguous in a list. */
  ariaLabel?: string;
}

type Step = "idle" | "asking" | "returned";

/**
 * A two-step button for something that cannot be undone from the page: rotating an invite link,
 * removing a student. The first press only asks; Cancel or success puts focus back where it was.
 *
 * A failure keeps the question open with the reason beside it. Focus stays on the confirm button,
 * where the next useful press is a retry, and the reason is announced through a polite live region
 * that is rendered empty before anything fails, so screen readers pick up the change.
 */
export function ConfirmSubmit({
  action,
  label,
  confirmLabel,
  warning,
  ariaLabel,
}: ConfirmSubmitProps) {
  const [step, setStep] = useState<Step>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const messageId = useId();

  // Focus follows the step: to Cancel when asking, back to the first button when it is over.
  useEffect(() => {
    if (step === "idle") return;
    wrapperRef.current?.querySelector<HTMLButtonElement>("[data-focus-target]")?.focus();
  }, [step]);

  // After each failure, focus is on the confirm button, ready for a retry.
  useEffect(() => {
    if (failures === 0) return;
    wrapperRef.current?.querySelector<HTMLButtonElement>("button[type='submit']")?.focus();
  }, [failures]);

  function close() {
    setMessage(null);
    setStep("returned");
  }

  async function confirm(formData: FormData) {
    // A second press while the first is in flight is dropped, not queued behind it.
    if (inFlight.current) return;
    inFlight.current = true;
    // Cleared first, so the same sentence twice in a row is still announced twice.
    setMessage(null);
    const outcome = await action(formData).finally(() => {
      inFlight.current = false;
    });
    if (outcome && !outcome.ok) {
      setMessage(outcome.message);
      setFailures((count) => count + 1);
      return;
    }
    close();
  }

  if (step !== "asking") {
    return (
      <div ref={wrapperRef}>
        <Button
          data-focus-target
          variant="secondary"
          size="sm"
          aria-label={ariaLabel}
          onClick={() => setStep("asking")}
        >
          {label}
        </Button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef}>
      <form action={confirm} className="flex flex-col gap-2">
        <p className="text-sm text-ink-1">{warning}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            aria-describedby={message ? messageId : undefined}
          >
            {confirmLabel}
          </Button>
          <Button data-focus-target variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
        </div>
        {/* Always rendered: a region that appears with its text already in it is often not read. */}
        <p id={messageId} aria-live="polite" className="text-sm text-incorrect">
          {message}
        </p>
      </form>
    </div>
  );
}
