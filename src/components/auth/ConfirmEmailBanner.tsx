"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";

export type ConfirmEmailState =
  { status: "idle" } | { status: "sent" } | { status: "error"; error: string };

export interface ConfirmEmailBannerProps {
  /** `resendConfirmation`: emails the link to the account's own address. */
  action: () => Promise<ConfirmEmailState>;
  email: string;
}

const INITIAL: ConfirmEmailState = { status: "idle" };

/**
 * Shown to an account that joined with a password and has not yet opened the email sent to it.
 * It asks and never blocks: everything on the page works either way. What confirming buys is that
 * "Forgot your password?" can reach them, which is worth saying in those words.
 */
export function ConfirmEmailBanner({ action, email }: ConfirmEmailBannerProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <section
      aria-labelledby="confirm-email-heading"
      className="mb-8 rounded-sm border border-line bg-surface-2 px-4 py-3"
    >
      <h2 id="confirm-email-heading" className="text-base font-medium text-ink-1">
        Confirm your email address
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        We sent a link to {email}. Open it when you can, so you can get back in if you ever forget
        your password. Nothing is locked until then.
      </p>
      <form action={formAction} className="mt-2 flex flex-wrap items-center gap-x-3">
        <Button type="submit" variant="ghost" size="sm" disabled={pending} aria-disabled={pending}>
          {pending ? "Sending…" : "Send the email again"}
        </Button>
        <p role="status" className="text-sm text-ink-2">
          {state.status === "sent" ? "Sent. Check your inbox and your spam folder." : null}
          {state.status === "error" ? state.error : null}
        </p>
      </form>
    </section>
  );
}
