"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { FieldError } from "@/components/authoring/FieldError";
import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";

export type ClassFormState =
  { status: "idle" } | { status: "saved" } | { status: "error"; error: string };

export interface ClassNameFormProps {
  action: (state: ClassFormState, formData: FormData) => Promise<ClassFormState>;
  /** Prefills the field, for renaming. */
  initialName?: string;
  submitLabel?: string;
}

const INITIAL: ClassFormState = { status: "idle" };

/** Names a class: a new one, or renaming one when given its current name. */
export function ClassNameForm({
  action,
  initialName = "",
  submitLabel = "Create class",
}: ClassNameFormProps) {
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
          Class name
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
          className={fieldClasses("px-3 text-base")}
        />
        {error ? (
          <FieldError id={`${id}-error`} role="alert">
            {error}
          </FieldError>
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
