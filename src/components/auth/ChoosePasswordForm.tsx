"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from "@/lib/auth/passwordRules";
import { PasswordField } from "./PasswordField";

export type ChoosePasswordState =
  { status: "idle" } | { status: "saved" } | { status: "error"; error: string };

export interface ChoosePasswordFormProps {
  action: (state: ChoosePasswordState, formData: FormData) => Promise<ChoosePasswordState>;
  /** The account the password is for, so nobody saves one to the wrong account. */
  email: string;
  /** Where to go afterwards, already made safe by the page. */
  next: string;
}

const INITIAL: ChoosePasswordState = { status: "idle" };
const LINK =
  "tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline";

/** Chooses or changes the signed-in person's password. Always skippable: the emailed link still works. */
export function ChoosePasswordForm({ action, email, next }: ChoosePasswordFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const errorId = `${id}-error`;
  const error = state.status === "error" ? state.error : null;

  useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
    if (state.status === "saved") savedRef.current?.focus();
  }, [state]);

  if (state.status === "saved") {
    return (
      <section aria-labelledby={`${id}-saved`}>
        <h2
          id={`${id}-saved`}
          ref={savedRef}
          tabIndex={-1}
          className="mb-2 text-xl font-medium text-ink-1 outline-none"
        >
          Password saved
        </h2>
        <p className="mb-6 text-ink-2">
          Next time, sign in with {email} and this password. Any other device signed in to this
          account has been signed out.
        </p>
        <Link href={next} className={LINK}>
          Continue
        </Link>
      </section>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* Hidden from sight, present for password managers, which file the password under it. */}
      <input
        type="email"
        name="email"
        autoComplete="username"
        value={email}
        readOnly
        hidden
        aria-hidden="true"
        tabIndex={-1}
      />
      <PasswordField
        id={`${id}-password`}
        label="New password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        minLength={PASSWORD_MIN_LENGTH}
        inputRef={inputRef}
        invalid={error !== null}
        errorId={error ? errorId : undefined}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-incorrect">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
      <Link href={next} className={LINK}>
        Not now
      </Link>
    </form>
  );
}
