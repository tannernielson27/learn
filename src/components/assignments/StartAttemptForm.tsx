"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export interface StartAttemptFormProps {
  /** The Server Action, already bound to the assignment. */
  start: (previous: { error: string | null }) => Promise<{ error: string | null }>;
  label: string;
}

/** The one button that starts an attempt, with the database's reason beside it if it says no. */
export function StartAttemptForm({ start, label }: StartAttemptFormProps) {
  const [state, action, pending] = useActionState(start, { error: null });
  return (
    <form action={action} className="mt-6 flex flex-col items-start gap-2">
      <Button type="submit" variant="primary" size="lg" className="min-w-40" disabled={pending}>
        {pending ? "Starting" : label}
      </Button>
      {state.error ? <Notice role="alert">{state.error}</Notice> : null}
    </form>
  );
}
