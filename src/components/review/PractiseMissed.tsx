"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export type PractiseMissedState = { error: string | null };

export interface PractiseMissedProps {
  /** How many were missed: the button says it. Nothing is offered for none. */
  missed: number;
  /** The Server Action, bound to the source on the server. On success it moves to the new run. */
  action: (previous: PractiseMissedState) => Promise<PractiseMissedState>;
  className?: string;
}

export const PRACTICE_NEVER_GRADED = "Not graded.";

/**
 * "Practise the N I missed" (owner decision 6): a new practice run of only those questions. The
 * server works out which they are and starts the run; this only names the source.
 */
export function PractiseMissed({ missed, action, className = "" }: PractiseMissedProps) {
  const [state, run, pending] = useActionState(action, { error: null });
  if (missed <= 0) return null;
  return (
    <form action={run} className={`flex flex-col gap-2 ${className}`.trim()}>
      <Button type="submit" variant="primary" size="lg" block disabled={pending}>
        {pending ? "Starting practice" : `Practise the ${missed} I missed`}
      </Button>
      {state.error ? <Notice role="alert">{state.error}</Notice> : null}
    </form>
  );
}
