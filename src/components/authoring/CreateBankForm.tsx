"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export type BankFormState =
  { status: "idle" } | { status: "saved" } | { status: "error"; error: string };

export interface CreateBankFormProps {
  action: (state: BankFormState, formData: FormData) => Promise<BankFormState>;
  /** Prefills the field, for renaming an existing bank. */
  initialName?: string;
  submitLabel?: string;
}

const INITIAL: BankFormState = { status: "idle" };

/** Names a bank: creating a new one, or renaming one when given its current name. */
export function CreateBankForm({
  action,
  initialName = "",
  submitLabel = "Create bank",
}: CreateBankFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Controlled, so React's reset after an action never wipes what was typed.
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const error = state.status === "error" ? state.error : null;

  useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:max-w-md">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-name`} className="text-sm font-medium text-ink-1">
          Bank name
        </label>
        <input
          ref={inputRef}
          id={`${id}-name`}
          name="name"
          type="text"
          required
          maxLength={120}
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="tap-target w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect"
        />
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
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
