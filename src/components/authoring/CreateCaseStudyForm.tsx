"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

// The action redirects to the new case study on success, so it only ever returns idle or an error.
export type CaseStudyFormState = { status: "idle" } | { status: "error"; error: string };

export interface CreateCaseStudyFormProps {
  action: (state: CaseStudyFormState, formData: FormData) => Promise<CaseStudyFormState>;
}

const INITIAL: CaseStudyFormState = { status: "idle" };
// Matches public.case_studies' check: length(title) between 1 and 200.
const MAX_TITLE = 200;

/** Starts a case study in a bank. Follows CreateBankForm: a controlled field, focus on error. */
export function CreateCaseStudyForm({ action }: CreateCaseStudyFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Controlled, so React's reset after an action never wipes what was typed.
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const error = state.status === "error" ? state.error : null;

  useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:max-w-md">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-title`} className="text-sm font-medium text-ink-1">
          Case study title
        </label>
        <input
          ref={inputRef}
          id={`${id}-title`}
          name="title"
          type="text"
          required
          maxLength={MAX_TITLE}
          autoComplete="off"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="tap-target w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect"
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-incorrect">
            {error}
          </p>
        ) : null}
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          New case study
        </Button>
      </div>
    </form>
  );
}
