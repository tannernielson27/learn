"use client";

import { useActionState } from "react";
import { FieldError } from "@/components/authoring/FieldError";
import { Button } from "@/components/ui/Button";

export type SampleImportState = { status: "idle" } | { status: "error"; error: string };

export interface ImportSampleFormProps {
  action: (state: SampleImportState, formData: FormData) => Promise<SampleImportState>;
}

const INITIAL: SampleImportState = { status: "idle" };

/** The Import the sample bank button (#265). On success the action opens the new bank. */
export function ImportSampleForm({ action }: ImportSampleFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" variant="primary" size="sm" disabled={pending} aria-busy={pending}>
        Import the sample quiz
      </Button>
      {pending ? (
        <p role="status" className="text-sm text-ink-2">
          Importing the sample…
        </p>
      ) : null}
      {state.status === "error" ? <FieldError role="alert">{state.error}</FieldError> : null}
    </form>
  );
}
