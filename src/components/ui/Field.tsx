import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { fieldClasses } from "./fieldClasses";
import { FieldError } from "./FieldError";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** The visible label, which is also the input's name. Always shown: no placeholder labels. */
  label: ReactNode;
  /** A line under the field that helps before anything is typed. */
  hint?: ReactNode;
  /**
   * What is wrong with what was typed. Marks the field invalid (its edge turns the strong ink rule,
   * `--field-invalid`, as every field's does) and is read with it through `aria-describedby`. The
   * words stay in ink with an alert icon: red is for marking answers (owner decision 2026-11-14).
   */
  error?: ReactNode;
  /** `code`: a Join code's mono, spaced, centred capitals. */
  appearance?: "text" | "code";
  /** Classes for the wrapper, which lays out label, input, hint and error. */
  className?: string;
  inputClassName?: string;
}

const APPEARANCE = {
  text: "h-13 px-3.5 text-lg",
  code: "h-13 px-3.5 text-center font-mono text-2xl tracking-[0.3em] uppercase",
} as const;

/** A labelled text field built on `fieldClasses`, with its hint and error wired to it. */
export function Field({
  label,
  hint,
  error,
  appearance = "text",
  className = "",
  inputClassName = "",
  id,
  ...rest
}: FieldProps) {
  const own = useId();
  const inputId = id ?? own;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null, rest["aria-describedby"] ?? null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={`grid gap-1.5 ${className}`.trim()}>
      <label htmlFor={inputId} className="text-sm font-semibold text-ink-1">
        {label}
      </label>
      <input
        {...rest}
        id={inputId}
        aria-invalid={error ? true : rest["aria-invalid"]}
        aria-describedby={describedBy}
        className={fieldClasses(`${APPEARANCE[appearance]} ${inputClassName}`.trim())}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-ink-2">
          {hint}
        </p>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
