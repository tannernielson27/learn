"use client";

import { startTransition, useActionState, useEffect, useId, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { folderOptions, UNFILED, type FolderRow } from "@/lib/authoring/folders";
import type { FolderFormState } from "./FolderNameForm";

export interface MoveToFolderFormProps {
  /** The lists' checkboxes join this form by its id. */
  id: string;
  folders: readonly FolderRow[];
  action: (state: FolderFormState, formData: FormData) => Promise<FolderFormState>;
}

const INITIAL: FolderFormState = { status: "idle" };

/**
 * Moves the checked items and case studies to a folder, or to Unfiled. Moving changes only where
 * content is filed.
 */
export function MoveToFolderForm({ id, folders, action }: MoveToFolderFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const uid = useId();
  const error = state.status === "error" ? state.error : null;

  // A form given `action` is reset by React as soon as it is submitted, which would clear the
  // selection even when the move is refused. Submitting here instead, the form is reset (and the
  // checkboxes that joined it cleared) only once a move is done.
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  useEffect(() => {
    if (state.status === "done") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} id={id} onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-col gap-2">
          <label htmlFor={`${uid}-folder`} className="text-sm font-medium text-ink-1">
            Move selected to
          </label>
          <select
            id={`${uid}-folder`}
            name="folder"
            defaultValue=""
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${uid}-error` : undefined}
            className="tap-target max-w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect"
          >
            <option value="" disabled>
              Choose a folder
            </option>
            <option value={UNFILED}>Unfiled</option>
            {folderOptions(folders).map((option) => (
              <option key={option.id} value={option.id}>
                {option.path}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          Move selected
        </Button>
      </div>
      {error ? (
        <p id={`${uid}-error`} role="alert" className="text-sm text-incorrect">
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
