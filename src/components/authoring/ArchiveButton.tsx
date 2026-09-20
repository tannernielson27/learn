"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";

export type ArchiveState = { status: "idle" } | { status: "error"; error: string };

export interface ArchiveButtonProps {
  /** Archives or restores, then the page shows the new status; or says why it could not. */
  action: (state: ArchiveState) => Promise<ArchiveState>;
  /** The button's text, e.g. "Archive item" or "Restore". */
  label: string;
  /** A fuller name for assistive technology, when the text alone would not say which row. */
  accessibleName?: string;
}

const INITIAL: ArchiveState = { status: "idle" };

/**
 * One button for Archive or Restore. The page keeps it in the same place when the status flips, so
 * focus stays on it while its text changes.
 */
export function ArchiveButton({ action, label, accessibleName }: ArchiveButtonProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "error") alertRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div>
        <Button type="submit" size="sm" disabled={pending} aria-label={accessibleName}>
          {label}
        </Button>
      </div>
      {state.status === "error" ? (
        <p ref={alertRef} role="alert" tabIndex={-1} className="max-w-prose text-sm text-incorrect">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
