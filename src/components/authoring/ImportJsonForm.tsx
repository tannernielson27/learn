"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";

export type ImportFormState =
  { status: "idle" } | { status: "error"; errors: string[] } | { status: "done"; message: string };

export interface ImportJsonFormProps {
  action: (state: ImportFormState, formData: FormData) => Promise<ImportFormState>;
}

const INITIAL: ImportFormState = { status: "idle" };

const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong";

/**
 * Imports a learn.v1 export into a bank, from a file or pasted text. Everything arrives as new
 * drafts; a refused import names every problem and writes nothing.
 */
export function ImportJsonForm({ action }: ImportJsonFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Controlled, so React's reset after an action never wipes what was pasted.
  const [json, setJson] = useState("");
  // Once an import lands, the pasted text is cleared, so pressing Import again cannot copy it twice.
  // Adjusted during render when a new result arrives, rather than in an effect.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "done") setJson("");
  }
  const id = useId();

  return (
    <form action={formAction} className="flex flex-col gap-4 sm:max-w-xl">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-file`} className="text-sm font-medium text-ink-1">
          JSON file
        </label>
        <input
          id={`${id}-file`}
          name="file"
          type="file"
          accept=".json,application/json"
          className="text-sm text-ink-1 file:tap-target file:mr-3 file:rounded-sm file:border file:border-line file:bg-surface-1 file:px-3 file:text-ink-1"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-json`} className="text-sm font-medium text-ink-1">
          Or paste JSON
        </label>
        <textarea
          id={`${id}-json`}
          name="json"
          rows={6}
          spellCheck={false}
          value={json}
          onChange={(event) => setJson(event.target.value)}
          className={`${fieldClass} font-mono text-sm`}
        />
      </div>
      <p className="text-sm text-ink-2">
        Items and case studies arrive as new drafts. Nothing already in this bank is changed.
      </p>
      <div>
        <Button type="submit" disabled={pending}>
          Import
        </Button>
      </div>
      {state.status === "error" ? (
        <div role="alert" className="rounded-sm border border-line bg-surface-1 p-4 text-sm">
          <p className="font-medium text-incorrect">Nothing was imported.</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-ink-1">
            {state.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {state.status === "done" ? (
        <p role="status" className="text-sm text-ink-2">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
