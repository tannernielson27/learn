"use client";

import { Play } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export interface StartLiveButtonProps extends Omit<ButtonProps, "type" | "children"> {
  /** The words on the button: "Start a live session" on a quiz, "Start" on a library row. */
  label: string;
}

/**
 * Submits the form that starts a live session (`startLiveSession`). It holds still while the
 * session is made, so a second press never starts a second one. A refusal comes back on the
 * quiz page as its own message, and anything else lands on the teacher area's error page.
 */
export function StartLiveButton({ label, disabled, ...rest }: StartLiveButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button {...rest} type="submit" disabled={disabled || pending} aria-busy={pending || undefined}>
      <Icon icon={Play} />
      {pending ? "Starting…" : label}
    </Button>
  );
}
