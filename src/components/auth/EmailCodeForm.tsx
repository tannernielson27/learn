"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";

export type EmailCodeState = { status: "idle" } | { status: "error"; error: string };

export interface EmailCodeFormProps {
  /** `verifySignInCode`; on success it redirects, so only a refusal comes back. */
  action: (state: EmailCodeState, formData: FormData) => Promise<EmailCodeState>;
  /** The address the code was sent to. */
  email: string;
  /** Where to go once signed in, already made safe by the page. */
  next: string;
}

const INITIAL: EmailCodeState = { status: "idle" };

/**
 * Under "Check your email" (#306): the one-time code from the same email, for someone who asked on
 * this device and opened the email on another. Typing it signs in here; the link would have signed
 * in wherever it was opened.
 */
export function EmailCodeForm({ action, email, next }: EmailCodeFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const error = state.status === "error" ? state.error : null;

  useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4 border-t border-line pt-6">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <p className="text-ink-2">
        Opened the email on another device? Type the code from it here to sign in on this one.
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-code`} className="text-sm font-medium text-ink-1">
          Code from the email
        </label>
        <input
          ref={inputRef}
          id={`${id}-code`}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 \-]*"
          required
          maxLength={16}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="tap-target w-full rounded-sm border border-line bg-surface-1 px-3 font-mono text-lg tracking-widest text-ink-1 hover:border-line-strong aria-invalid:border-incorrect"
        />
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-incorrect">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? "Checking the code…" : "Sign in with the code"}
      </Button>
    </form>
  );
}
