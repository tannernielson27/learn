import { useId, type ComponentProps, type ReactNode } from "react";
import { fieldClasses } from "./fieldClasses";
import { FieldError } from "./FieldError";

/** `ref` included (React 19 passes it as a prop), so a form can focus the box after an error. */
export interface TextareaProps extends ComponentProps<"textarea"> {
  /** The visible label. Always shown: no placeholder labels. */
  label: ReactNode;
  /** A line under the box that helps before anything is typed. */
  hint?: ReactNode;
  /** What is wrong with what was typed, read with the box through `aria-describedby`. */
  error?: ReactNode;
  /** Classes for the wrapper, which lays out label, box, hint and error. */
  className?: string;
  textareaClassName?: string;
}

/**
 * A labelled box for a few lines of writing, built on `fieldClasses` like `Field`, so the two look
 * and behave the same in every state: rest, hover, focus, invalid, read-only and disabled. It grows
 * only when the person drags it taller (`resize-y`), never sideways, so a 375px page cannot scroll.
 */
export function Textarea({
  label,
  hint,
  error,
  className = "",
  textareaClassName = "",
  id,
  rows = 5,
  ...rest
}: TextareaProps) {
  const own = useId();
  const boxId = id ?? own;
  const hintId = `${boxId}-hint`;
  const errorId = `${boxId}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null, rest["aria-describedby"] ?? null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={`grid gap-1.5 ${className}`.trim()}>
      <label htmlFor={boxId} className="text-sm font-semibold text-ink-1">
        {label}
      </label>
      <textarea
        {...rest}
        id={boxId}
        rows={rows}
        aria-invalid={error ? true : rest["aria-invalid"]}
        aria-describedby={describedBy}
        className={fieldClasses(
          `min-h-28 resize-y px-3.5 py-3 text-lg leading-normal ${textareaClassName}`.trim(),
        )}
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
