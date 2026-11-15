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
  /**
   * The field and its button on one row from 640px, for the create form a page header holds as
   * its main action (#563). Stacked otherwise, as the settings that rename it draw it.
   */
  inline?: boolean;
  /**
   * The name field's own id, for a link elsewhere on the page that lands on it ("New quiz" in an
   * empty list, #563): the browser scrolls to it and puts the cursor in it.
   */
  nameId?: string;
}

const INITIAL: ClassFormState = { status: "idle" };

/** Names a class: a new one, or renaming one when given its current name. */
export function ClassNameForm({
  action,
  initialName = "",
  submitLabel = "Create class",
  inline = false,
  nameId,
}: ClassNameFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Controlled, so React's reset after an action never wipes what was typed.
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const fieldId = nameId ?? `${id}-name`;
  const error = state.status === "error" ? state.error : null;

  useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
  }, [state]);

  const label = (
    <label htmlFor={fieldId} className="text-sm font-medium text-ink-1">
      Class name
    </label>
  );
  // Busy, not disabled (docs/04 §11): the button keeps its words and focus while it saves.
  const submit = (
    <Button type="submit" variant="primary" busy={pending}>
      {submitLabel}
    </Button>
  );

  const field = (
    <input
      ref={inputRef}
      id={fieldId}
      name="name"
      type="text"
      required
      maxLength={120}
      autoComplete="off"
      value={name}
      onChange={(event) => setName(event.target.value)}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      // Clear of the app's top bar when a link scrolls to it.
      className={fieldClasses(
        inline
          ? "min-w-0 flex-[1_1_10rem] scroll-mt-24 px-3 text-base"
          : "scroll-mt-24 px-3 text-base",
      )}
    />
  );
  const messages = (
    <>
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
    </>
  );

  if (inline) {
    return (
      <form action={formAction} className="flex flex-col gap-2">
        {label}
        <div className="flex flex-wrap items-start gap-2">
          {field}
          {submit}
        </div>
        {messages}
      </form>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:max-w-md">
      <div className="flex flex-col gap-2">
        {label}
        {field}
        {messages}
      </div>
      <div>{submit}</div>
    </form>
  );
}
