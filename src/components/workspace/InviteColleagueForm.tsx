"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { FieldError } from "@/components/authoring/FieldError";
import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";

export type InviteColleagueState =
  { status: "idle" } | { status: "sent"; email: string } | { status: "error"; error: string };

export interface InviteColleagueFormProps {
  action: (state: InviteColleagueState, formData: FormData) => Promise<InviteColleagueState>;
}

const INITIAL: InviteColleagueState = { status: "idle" };

/**
 * One email field: the colleague's address. The answer is a sentence under the field, an error
 * tied to it or a note that the email went. The address comes back as text and is drawn as text.
 */
export function InviteColleagueForm({ action }: InviteColleagueFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Controlled, so React's reset after an action never wipes an address that was refused.
  const [email, setEmail] = useState("");
  // An answer is handled once, as it arrives: a sent invitation empties the field for the next.
  const [answered, setAnswered] = useState(state);
  if (answered !== state) {
    setAnswered(state);
    if (state.status === "sent") setEmail("");
  }
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const error = state.status === "error" ? state.error : null;

  useEffect(() => {
    if (state.status !== "idle") inputRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 sm:max-w-md">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-email`} className="text-sm font-medium text-ink-1">
          Colleague&apos;s email address
        </label>
        <input
          ref={inputRef}
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="off"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={fieldClasses("px-3 text-base")}
        />
        {error ? (
          <FieldError id={`${id}-error`} role="alert">
            {error}
          </FieldError>
        ) : null}
        {state.status === "sent" ? (
          <p role="status" className="text-sm break-words text-ink-1">
            Invitation sent to {state.email}.
          </p>
        ) : null}
      </div>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Sending invitation…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}
