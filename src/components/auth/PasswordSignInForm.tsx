"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "./PasswordField";

export type PasswordSignInState =
  { status: "idle" } | { status: "error"; error: string; field: "email" | "password" };

export interface PasswordSignInFormProps {
  /** `signInWithEmailPassword`; on success it redirects, so only a refusal comes back. */
  action: (state: PasswordSignInState, formData: FormData) => Promise<PasswordSignInState>;
  /** Already made safe by the page. */
  next: string;
  /** Held by the panel, so the address survives a switch to the emailed link and back. */
  email: string;
  onEmailChange: (email: string) => void;
  autoFocus?: boolean;
}

const INITIAL: PasswordSignInState = { status: "idle" };
const FIELD =
  "tap-target w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

/** Email and password, one tap to sign in. The everyday way in; the emailed link is the spare key. */
export function PasswordSignInForm({
  action,
  next,
  email,
  onEmailChange,
  autoFocus = false,
}: PasswordSignInFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const errorId = `${id}-error`;
  const error = state.status === "error" ? state : null;

  useEffect(() => {
    if (state.status !== "error") return;
    (state.field === "email" ? emailRef : passwordRef).current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-email`} className="text-sm font-medium text-ink-1">
          Email address
        </label>
        <input
          ref={emailRef}
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          maxLength={254}
          autoFocus={autoFocus}
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          aria-invalid={error?.field === "email" ? true : undefined}
          aria-describedby={error?.field === "email" ? errorId : undefined}
          className={FIELD}
        />
      </div>
      <PasswordField
        id={`${id}-password`}
        autoComplete="current-password"
        inputRef={passwordRef}
        invalid={error?.field === "password"}
        errorId={error?.field === "password" ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-incorrect">
          {error.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
