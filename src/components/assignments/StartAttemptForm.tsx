"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";

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
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Starting" : label}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-incorrect">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
