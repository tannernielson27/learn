"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

export type SignInState =
  { status: "idle" } | { status: "sent"; email: string } | { status: "error"; error: string };

export interface SignInFormProps {
  action: (state: SignInState, formData: FormData) => Promise<SignInState>;
  /** Already made safe by the page. */
  next: string;
  /** The person arrived from a sign-in link that failed. */
  linkError?: boolean;
}

const LINK_ERROR = "That sign-in link has expired or was already used. Ask for a new one.";
const INITIAL: SignInState = { status: "idle" };

export function SignInForm({ action, next, linkError = false }: SignInFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [email, setEmail] = useState("");
  // The "sent" result the person chose to leave, so the form shows again without a new request.
  const [dismissed, setDismissed] = useState<SignInState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorId = useId();

  const showSent = state.status === "sent" && dismissed !== state;
  const error =
    state.status === "error" ? state.error : linkError && state === INITIAL ? LINK_ERROR : null;

  useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
    if (state.status === "sent") headingRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (dismissed) inputRef.current?.focus();
  }, [dismissed]);

  if (showSent) {
    return (
      <section aria-labelledby={`${errorId}-sent`}>
        <h2
          id={`${errorId}-sent`}
          ref={headingRef}
          tabIndex={-1}
          className="mb-2 text-xl font-medium text-ink-1 outline-none"
        >
          Check your email
        </h2>
        <p className="mb-6 text-ink-2">
          We sent a sign-in link to {state.email}. It works once and expires in an hour.
        </p>
        <Button onClick={() => setDismissed(state)}>Use a different email</Button>
      </section>
    );
  }

  return (
    <form action={formAction} noValidate={false} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`${errorId}-email`} className="text-sm font-medium text-ink-1">
          Email address
        </label>
        <input
          ref={inputRef}
          id={`${errorId}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={state.status === "error" ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="tap-target w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect"
        />
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-incorrect">
            {error}
          </p>
        ) : null}
      </div>
      <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
        {pending ? "Sending link…" : "Email me a sign-in link"}
      </Button>
    </form>
  );
}
