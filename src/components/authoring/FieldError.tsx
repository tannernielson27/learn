import { CircleAlert } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

export interface FieldErrorProps extends ComponentProps<"p"> {
  children: ReactNode;
}

/**
 * What is wrong with one field, under it: the words in ink with an alert icon, as `Field` draws
 * its own error. The field's `aria-invalid` edge carries the red; the words never do, because red
 * text is for marking answers (PLAN D11). For a field this form builds itself rather than `Field`.
 */
export function FieldError({ children, className = "", ...rest }: FieldErrorProps) {
  return (
    <p className={`flex items-start gap-2 text-sm text-ink-1 ${className}`.trim()} {...rest}>
      <Icon icon={CircleAlert} className="mt-0.5" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}
