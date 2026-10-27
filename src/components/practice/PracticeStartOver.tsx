"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";

export type StartOverState = { error: string | null };

export interface PracticeStartOverProps {
  /** The Server Action, already bound to the bank. On success it reads the page again. */
  startOver: (previous: StartOverState) => Promise<StartOverState>;
  /**
   * The button's words. Given at the end of a run ("Start over with all 21"), where it sits with
   * the other results actions as a full-width button rather than in a section of its own.
   */
  label?: string;
}

export const START_OVER_WARNING = "Start over? Every question starts unanswered.";

/**
 * "Start over" for a practice run (#241), asked twice, as `ConfirmSubmit` asks: the first press
 * says what will happen and moves focus to Cancel, so a second Enter cannot start over by
 * accident; Cancel puts focus back. Confirming opens a new run on the server and reads the page
 * again, which remounts the player on the new run.
 */
export function PracticeStartOver({ startOver, label }: PracticeStartOverProps) {
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
    <section aria-label="Start over" className={label ? "" : "mt-10 border-t border-line pt-6"}>
      <div ref={wrapperRef}>
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
          <div className="flex flex-col items-start">
            <Button
              data-focus-target
              variant="secondary"
              block={label !== undefined}
              onClick={() => setAsking(true)}
            >
              {label ?? "Start over"}
            </Button>
          </div>
        )}
      </div>
      {state.error ? (
        <Notice role="alert" className="mt-2">
          {state.error}
        </Notice>
      ) : null}
    </section>
  );
}
