import { CircleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "./Icon";

export interface FieldErrorProps extends ComponentProps<"p"> {
  children: ReactNode;
}

/**
 * What is wrong with one field, under it: the words in ink with an alert icon. `Field` draws its
 * own error with this; a form that builds its own field puts it under the field and points the
 * field's `aria-describedby` at its `id`. Neither the words nor the field's `aria-invalid` edge
 * are red: red only ever marks an answer (PLAN D11, owner decision 2026-11-14), so the edge turns
 * the strong ink rule (`--field-invalid`) and the icon says something is wrong.
 */
export function FieldError({ children, className = "", ...rest }: FieldErrorProps) {
  return (
    <p className={`flex items-start gap-2 text-sm text-ink-1 ${className}`.trim()} {...rest}>
      <Icon icon={CircleAlert} className="mt-0.5" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
