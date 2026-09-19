"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";

export type DuplicateState = { status: "idle" } | { status: "error"; error: string };

export interface DuplicateButtonProps {
  /** Makes the copy and opens it in its editor, or says why it could not. */
  action: (state: DuplicateState) => Promise<DuplicateState>;
  /** The button's name, e.g. "Duplicate item". */
  label: string;
}

const INITIAL: DuplicateState = { status: "idle" };

export function DuplicateButton({ action, label }: DuplicateButtonProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "error") alertRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {label}
        </Button>
      </div>
      {state.status === "error" ? (
        <p ref={alertRef} role="alert" tabIndex={-1} className="text-sm text-incorrect">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
