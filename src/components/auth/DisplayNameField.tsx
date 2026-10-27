import type { Ref } from "react";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { ACCOUNT_NAME_MAX_LENGTH } from "@/lib/auth/displayName";

export interface DisplayNameFieldProps {
  id: string;
  /** What the account is called now, on the account page. */
  defaultValue?: string;
  /**
   * Held by the form instead, so the name survives React resetting the form after an answer
   * that asks for another try (a wrong password, say).
   */
  value?: string;
  onValueChange?: (value: string) => void;
  /** Shown under the field and read with it, when the form needs one. None by default. */
  hint?: string;
  /** The id of the error message that describes this field, when there is one. */
  errorId?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
}

/**
 * "Your name" (#358), posted as `displayName` and checked again on the server by
 * `displayNameRule`. The browser's `required` and `maxlength` are only a convenience.
 */
export function DisplayNameField({
  id,
  defaultValue,
  value,
  onValueChange,
  hint,
  errorId,
  invalid = false,
  autoFocus = false,
  inputRef,
}: DisplayNameFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-ink-1">
        Your name
      </label>
      <input
        ref={inputRef}
        id={id}
        name="displayName"
        type="text"
        autoComplete="name"
        autoCapitalize="words"
        required
        maxLength={ACCOUNT_NAME_MAX_LENGTH}
        {...(value === undefined
          ? { defaultValue }
          : { value, onChange: (event) => onValueChange?.(event.target.value) })}
        autoFocus={autoFocus}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={fieldClasses("h-13 px-3.5 text-lg")}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
