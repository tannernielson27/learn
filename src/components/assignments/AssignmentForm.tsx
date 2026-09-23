"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  ATTEMPT_CHOICES,
  DEFAULT_ATTEMPTS,
  defaultWindow,
  localInputToIso,
  toLocalInputValue,
} from "@/lib/assignments/assignments";
import { useHydrated } from "./useHydrated";

export type AssignmentFormState =
  { status: "idle" } | { status: "saved" } | { status: "error"; error: string };

export interface AssignmentFormProps {
  action: (state: AssignmentFormState, formData: FormData) => Promise<AssignmentFormState>;
  /** The classes to choose from, when assigning. Absent when editing an assignment. */
  classes?: readonly { id: string; name: string }[];
  /** An existing assignment's values, as instants. Absent when assigning. */
  initial?: { opensAt: string; closesAt: string; maxAttempts: number; shuffleOptions: boolean };
  /** An assignment that has opened: only its close time can change. */
  closeOnly?: boolean;
  submitLabel: string;
}

const INITIAL: AssignmentFormState = { status: "idle" };

const fieldClass =
  "tap-target w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 " +
  "hover:border-line-strong aria-invalid:border-incorrect";

/**
 * Assigns a bank or a case study to a class, or edits an assignment's window. Times are typed in
 * the viewer's own zone and sent as instants, so the form only renders once the browser is running
 * it: the server does not know the viewer's zone.
 */
export function AssignmentForm(props: AssignmentFormProps) {
  const hydrated = useHydrated();
  if (!hydrated) return <p className="text-ink-2">Loading the form.</p>;
  return <AssignmentFields {...props} />;
}

function initialWindow(initial: AssignmentFormProps["initial"]) {
  if (!initial) return defaultWindow(new Date());
  return {
    opensAt: toLocalInputValue(new Date(initial.opensAt)),
    closesAt: toLocalInputValue(new Date(initial.closesAt)),
  };
}

function AssignmentFields({
  action,
  classes,
  initial,
  closeOnly = false,
  submitLabel,
}: AssignmentFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Controlled, so React's reset after an action never wipes what was chosen.
  const [start] = useState(() => initialWindow(initial));
  const [opens, setOpens] = useState(start.opensAt);
  const [closes, setCloses] = useState(start.closesAt);
  const [classId, setClassId] = useState(classes?.[0]?.id ?? "");
  const [attempts, setAttempts] = useState(String(initial?.maxAttempts ?? DEFAULT_ATTEMPTS));
  const [shuffle, setShuffle] = useState(initial?.shuffleOptions ?? true);
  const firstRef = useRef<HTMLSelectElement & HTMLInputElement>(null);
  const id = useId();
  const error = state.status === "error" ? state.error : null;
  const describedBy = error ? `${id}-error` : undefined;

  useEffect(() => {
    if (state.status === "error") firstRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4 sm:max-w-md">
      {classes ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-class`} className="text-sm font-medium text-ink-1">
            Class
          </label>
          <select
            ref={firstRef}
            id={`${id}-class`}
            name="classId"
            required
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={fieldClass}
          >
            {classes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {closeOnly ? null : (
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor={`${id}-opens`} className="text-sm font-medium text-ink-1">
              Opens
            </label>
            <input
              ref={classes ? undefined : firstRef}
              id={`${id}-opens`}
              type="datetime-local"
              required
              value={opens}
              onChange={(event) => setOpens(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              className={fieldClass}
            />
            <input type="hidden" name="opensAt" value={localInputToIso(opens) ?? ""} />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={`${id}-closes`} className="text-sm font-medium text-ink-1">
            Closes
          </label>
          <input
            ref={closeOnly ? firstRef : undefined}
            id={`${id}-closes`}
            type="datetime-local"
            required
            value={closes}
            onChange={(event) => setCloses(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={fieldClass}
          />
          <input type="hidden" name="closesAt" value={localInputToIso(closes) ?? ""} />
        </div>
      </div>

      {closeOnly ? null : (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-attempts`} className="text-sm font-medium text-ink-1">
              Attempts
            </label>
            <select
              id={`${id}-attempts`}
              name="maxAttempts"
              value={attempts}
              onChange={(event) => setAttempts(event.target.value)}
              aria-describedby={`${id}-attempts-hint`}
              className={`${fieldClass} sm:max-w-40`}
            >
              {ATTEMPT_CHOICES.map((count) => (
                <option key={count} value={String(count)}>
                  {count}
                </option>
              ))}
            </select>
            <p id={`${id}-attempts-hint`} className="text-sm text-ink-2">
              The best attempt counts.
            </p>
          </div>
          <label className="tap-target inline-flex items-center gap-2 text-ink-1">
            <input
              type="checkbox"
              name="shuffleOptions"
              checked={shuffle}
              onChange={(event) => setShuffle(event.target.checked)}
            />
            Shuffle answer options
          </label>
        </>
      )}

      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-incorrect">
          {error}
        </p>
      ) : null}
      {state.status === "saved" ? (
        <p role="status" className="text-sm text-ink-2">
          Saved.
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
