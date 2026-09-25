"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export type StartOverState = { error: string | null };

export interface PracticeStartOverProps {
  /** The Server Action, already bound to the bank. On success it reads the page again. */
  startOver: (previous: StartOverState) => Promise<StartOverState>;
}

export const START_OVER_WARNING =
  "Start over with every item unanswered? Your answers so far are set aside, and your first answers still count in Your steps.";

/**
 * "Start over" for a practice run (#241), asked twice, as `ConfirmSubmit` asks: the first press
 * says what will happen and moves focus to Cancel, so a second Enter cannot start over by
 * accident; Cancel puts focus back. Confirming opens a new run on the server and reads the page
 * again, which remounts the player on the new run.
 */
export function PracticeStartOver({ startOver }: PracticeStartOverProps) {
  const [asking, setAsking] = useState(false);
  const [returned, setReturned] = useState(false);
  const [state, action, pending] = useActionState(startOver, { error: null });
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (asking || returned) {
      wrapperRef.current?.querySelector<HTMLButtonElement>("[data-focus-target]")?.focus();
    }
  }, [asking, returned]);

  return (
    <section aria-labelledby="start-over-heading" className="mt-10 border-t border-line pt-6">
      <h2 id="start-over-heading" className="text-base font-medium text-ink-1">
        Start over
      </h2>
      <div ref={wrapperRef} className="mt-2">
        {asking ? (
          <form action={action} className="flex flex-col items-start gap-3">
            <p className="measure text-sm text-ink-1">{START_OVER_WARNING}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" disabled={pending}>
                {pending ? "Starting over" : "Start over now"}
              </Button>
              <Button
                data-focus-target
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setAsking(false);
                  setReturned(true);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-start gap-2">
            <p className="measure text-sm text-ink-2">Practice never counts toward a grade.</p>
            <Button data-focus-target variant="secondary" onClick={() => setAsking(true)}>
              Start over
            </Button>
          </div>
        )}
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-sm text-incorrect">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
