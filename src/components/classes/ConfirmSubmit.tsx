"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export interface ConfirmSubmitProps {
  /** A Server Function, already bound to what it acts on. */
  action: (formData: FormData) => Promise<void>;
  label: string;
  confirmLabel: string;
  /** What confirming will do, said before it happens. */
  warning: string;
  /** An accessible name for the first button when `label` alone is ambiguous in a list. */
  ariaLabel?: string;
}

/**
 * A two-step button for something that cannot be undone from the page: rotating an invite link,
 * removing a student. The first press only asks; Cancel puts focus back where it was.
 */
export function ConfirmSubmit({
  action,
  label,
  confirmLabel,
  warning,
  ariaLabel,
}: ConfirmSubmitProps) {
  const [asking, setAsking] = useState(false);
  const [returned, setReturned] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Focus follows the step: to Cancel when asking, back to the first button when called off.
  useEffect(() => {
    if (asking || returned) {
      wrapperRef.current?.querySelector<HTMLButtonElement>("[data-focus-target]")?.focus();
    }
  }, [asking, returned]);

  if (!asking) {
    return (
      <div ref={wrapperRef}>
        <Button
          data-focus-target
          variant="secondary"
          size="sm"
          aria-label={ariaLabel}
          onClick={() => setAsking(true)}
        >
          {label}
        </Button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef}>
      <form action={action} className="flex flex-col gap-2">
        <p className="text-sm text-ink-1">{warning}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" size="sm">
            {confirmLabel}
          </Button>
          <Button
            data-focus-target
            variant="ghost"
            size="sm"
            onClick={() => {
              setAsking(false);
              setReturned(true);
            }}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
