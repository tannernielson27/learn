"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { FieldError } from "@/components/authoring/FieldError";
import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";
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

  const field = fieldClasses("px-3 text-base");

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${fieldId}-code`} className="text-sm font-medium text-ink-1">
          Join code
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
          // The phone keyboard's Enter says "Next" here and moves to the name, as it says.
          enterKeyHint="next"
          onKeyDown={(event) => {
            if (event.key !== "Enter" || nameRef.current === null) return;
            if (nameRef.current.value.trim() !== "") return;
            event.preventDefault();
            nameRef.current.focus();
          }}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus={code === ""}
          aria-invalid={codeError ? true : undefined}
          aria-describedby={codeError ? `${fieldId}-code-error` : `${fieldId}-code-hint`}
          className={fieldClasses(
            "px-4 font-mono text-2xl font-semibold tracking-[0.2em] uppercase",
          )}
        />
        {codeError ? (
          <FieldError id={`${fieldId}-code-error`} role="alert">
            {codeError}
          </FieldError>
        ) : (
          <p id={`${fieldId}-code-hint`} className="text-sm text-ink-2">
            Six characters, on the screen at the front.
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
          enterKeyHint="go"
          autoFocus={code !== ""}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${fieldId}-name-error` : `${fieldId}-name-hint`}
          className={field}
        />
        {nameError ? (
          <FieldError id={`${fieldId}-name-error`} role="alert">
            {nameError}
          </FieldError>
        ) : (
          <p id={`${fieldId}-name-hint`} className="text-sm text-ink-2">
            Your teacher sees this name. The class sees it only before the start.
          </p>
        )}
      </div>

      {formError ? <FieldError role="alert">{formError}</FieldError> : null}

      {/* At the foot of the screen on a phone, in thumb reach (Main mockup). */}
      <div className="mt-auto pt-2">
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          disabled={pending}
          aria-disabled={pending}
        >
          {pending ? "Joining…" : "Join"}
        </Button>
      </div>
    </form>
  );
}
