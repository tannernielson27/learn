"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/live/displayName";
import type { JoinField } from "@/lib/live/joinForm";
import { SESSION_CODE_LENGTH } from "@/lib/live/sessionCode";

export type JoinState = { status: "idle" } | { status: "error"; field?: JoinField; error: string };

export interface JoinFormProps {
  action: (state: JoinState, formData: FormData) => Promise<JoinState>;
  /** Normalized by the page. Empty when the code was not in the address. */
  code: string;
}

const INITIAL: JoinState = { status: "idle" };

/**
 * Code and name, and nothing else: no account, no email, no password. Built at 375px first —
 * this is a phone screen in a classroom — and it works without JavaScript, because the whole of
 * it is one form posting to a Server Function.
 *
 * A code that arrived in the address (from the QR code on the host's screen) is filled in and the
 * name field takes focus, so a scan is one tap and one word.
 */
export function JoinForm({ action, code }: JoinFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const fieldId = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const error = state.status === "error" ? state : null;
  const codeError = error?.field === "code" ? error.error : null;
  const nameError = error?.field === "displayName" ? error.error : null;
  const formError = error && error.field === undefined ? error.error : null;

  useEffect(() => {
    if (state.status !== "error") return;
    if (state.field === "displayName") nameRef.current?.focus();
    else codeRef.current?.focus();
  }, [state]);

  const field =
    "tap-target w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 " +
    "transition-[border-color] duration-fast ease-out-expo hover:border-line-strong " +
    "aria-invalid:border-incorrect";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${fieldId}-code`} className="text-sm font-medium text-ink-1">
          Session code
        </label>
        <input
          ref={codeRef}
          id={`${fieldId}-code`}
          name="code"
          type="text"
          defaultValue={code}
          required
          // Long enough for the spaced form people copy off a screen: "ABC DEF".
          maxLength={SESSION_CODE_LENGTH + 3}
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={code === ""}
          aria-invalid={codeError ? true : undefined}
          aria-describedby={codeError ? `${fieldId}-code-error` : `${fieldId}-code-hint`}
          className={`${field} font-mono text-xl tracking-[0.2em] uppercase`}
        />
        {codeError ? (
          <p id={`${fieldId}-code-error`} role="alert" className="text-sm text-incorrect">
            {codeError}
          </p>
        ) : (
          <p id={`${fieldId}-code-hint`} className="text-sm text-ink-2">
            Six characters, from the screen at the front.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${fieldId}-name`} className="text-sm font-medium text-ink-1">
          Display name
        </label>
        <input
          ref={nameRef}
          id={`${fieldId}-name`}
          name="displayName"
          type="text"
          required
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoComplete="nickname"
          autoFocus={code !== ""}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${fieldId}-name-error` : `${fieldId}-name-hint`}
          className={field}
        />
        {nameError ? (
          <p id={`${fieldId}-name-error`} role="alert" className="text-sm text-incorrect">
            {nameError}
          </p>
        ) : (
          <p id={`${fieldId}-name-hint`} className="text-sm text-ink-2">
            The rest of the class sees this. Up to {DISPLAY_NAME_MAX_LENGTH} characters.
          </p>
        )}
      </div>

      {formError ? (
        <p role="alert" className="text-sm text-incorrect">
          {formError}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
        {pending ? "Joining…" : "Join"}
      </Button>
    </form>
  );
}
