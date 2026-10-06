"use client";

import { useState, type Ref } from "react";

export interface PasswordFieldProps {
  id: string;
  label?: string;
  /** `current-password` to sign in, `new-password` to choose one, so password managers do the right thing. */
  autoComplete: "current-password" | "new-password";
  /** Shown under the field and read with it, e.g. the length rule when choosing a password. */
  hint?: string;
  /** The id of the error message that describes this field, when there is one. */
  errorId?: string;
  invalid?: boolean;
  minLength?: number;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * A password field with a Show button. Typed once, never twice: seeing what was typed catches a
 * slip better than typing it again does, and it is half the work on a phone.
 */
export function PasswordField({
  id,
  label = "Password",
  autoComplete,
  hint,
  errorId,
  invalid = false,
  minLength,
  inputRef,
}: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-ink-1">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name="password"
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          minLength={minLength}
          maxLength={72}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          className="tap-target w-full rounded-sm border border-line bg-surface-1 pr-18 pl-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect"
        />
        <button
          type="button"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-controls={id}
          onClick={() => setShown((value) => !value)}
          className="tap-target absolute inset-y-0 right-0 inline-flex w-16 items-center justify-center rounded-sm text-sm font-medium text-accent-ink transition-colors duration-fast hover:bg-accent-soft"
        >
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
