"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FOLDER_NAME_MAX } from "@/lib/authoring/folders";

export type FolderFormState =
  { status: "idle" } | { status: "error"; error: string } | { status: "done"; message: string };

export interface FolderNameFormProps {
  action: (state: FolderFormState, formData: FormData) => Promise<FolderFormState>;
  label: string;
  submitLabel: string;
  /** Prefills the field, for renaming. Without one, the field clears after each folder is created. */
  initialName?: string;
  /** A short note tied to the field, such as where a new folder will go. */
  hint?: string;
}

const INITIAL: FolderFormState = { status: "idle" };

/** Names a folder: creating one, or renaming the open one when given its current name. */
export function FolderNameForm({
  action,
  label,
  submitLabel,
  initialName,
  hint,
}: FolderNameFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Controlled, so React's reset after an action never wipes what was typed.
  const [name, setName] = useState(initialName ?? "");
  // A created folder clears the field for the next one; adjusted during render, not in an effect.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "done" && initialName === undefined) setName("");
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const error = state.status === "error" ? state.error : null;
  const describedBy =
    [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") ||
    undefined;

  useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor={`${id}-name`} className="text-sm font-medium text-ink-1">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id={`${id}-name`}
          name="name"
          type="text"
          required
          maxLength={FOLDER_NAME_MAX}
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="tap-target min-w-0 flex-1 rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect"
        />
        <Button type="submit" size="sm" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-incorrect">
          {error}
        </p>
      ) : null}
      {state.status === "done" ? (
        <p role="status" className="text-sm text-ink-2">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
