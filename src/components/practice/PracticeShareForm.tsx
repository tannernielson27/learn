"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";

export type ShareFormState =
  { status: "idle" } | { status: "shared" } | { status: "error"; error: string };

export interface PracticeShareFormProps {
  /** A Server Function bound to the bank (choosing a class) or the class (choosing a bank). */
  action: (state: ShareFormState, formData: FormData) => Promise<ShareFormState>;
  /** What can still be chosen: the classes or banks not already shared. */
  choices: readonly { id: string; name: string }[];
  /** The select's label: "Class" or "Bank". */
  label: string;
  /** Said instead of the form when there is nothing left to choose. */
  emptyMessage: string;
}

const INITIAL: ShareFormState = { status: "idle" };

/** Share a bank with a class for practice (#240), from either side. */
export function PracticeShareForm({
  action,
  choices,
  label,
  emptyMessage,
}: PracticeShareFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const selectRef = useRef<HTMLSelectElement>(null);
  const id = useId();
  const error = state.status === "error" ? state.error : null;

  useEffect(() => {
    if (state.status === "error") selectRef.current?.focus();
  }, [state]);

  if (choices.length === 0) {
    return (
      <>
        <p className="text-sm text-ink-2">{emptyMessage}</p>
        {state.status === "shared" ? (
          <p role="status" className="text-sm text-ink-2">
            Shared for practice.
          </p>
        ) : null}
      </>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:max-w-md">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-target`} className="text-sm font-medium text-ink-1">
          {label}
        </label>
        <select
          ref={selectRef}
          id={`${id}-target`}
          name="target"
          defaultValue={choices[0]?.id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="tap-target w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect"
        >
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name}
            </option>
          ))}
        </select>
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-incorrect">
            {error}
          </p>
        ) : null}
        {state.status === "shared" ? (
          <p role="status" className="text-sm text-ink-2">
            Shared for practice.
          </p>
        ) : null}
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          Share for practice
        </Button>
      </div>
    </form>
  );
}
