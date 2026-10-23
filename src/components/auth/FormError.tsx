import type { ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";

export interface FormErrorProps {
  /** For the field's `aria-describedby`, so the reason is read with the field. */
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Why a form was refused, as a neutral `Notice` (PLAN D11: red is for marked answers). An alert,
 * since it stops what the person was doing; the id sits on a wrapper so a field can point at it.
 */
export function FormError({ id, className, children }: FormErrorProps) {
  return (
    <div id={id} className={className}>
      <Notice role="alert">{children}</Notice>
    </div>
  );
}
