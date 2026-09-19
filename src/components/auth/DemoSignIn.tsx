"use client";

import { useActionState, useId } from "react";
import { Button } from "@/components/ui/Button";

export type DemoSignInState = { status: "idle" } | { status: "error"; error: string };

export interface DemoSignInProps {
  /** Redirects on success, so it only ever resolves with an error. */
  action: (state: DemoSignInState, formData: FormData) => Promise<DemoSignInState>;
  /** Already made safe by the page. */
  next: string;
}

const INITIAL: DemoSignInState = { status: "idle" };

/** Signs in to the shared demo account. The page renders it only when the demo is configured. */
export function DemoSignIn({ action, next }: DemoSignInProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const id = useId();

  return (
    <section aria-labelledby={`${id}-heading`} className="mt-8 border-t border-line pt-6">
      <h2 id={`${id}-heading`} className="mb-1 text-base font-medium text-ink-1">
        Try the demo
      </h2>
      <p id={`${id}-note`} className="mb-4 text-sm text-ink-2">
        Signs you in to a shared instructor account, no email needed. Everyone using the demo sees
        and changes the same banks.
      </p>
      <form action={formAction}>
        <input type="hidden" name="next" value={next} />
        <Button
          type="submit"
          className="w-full"
          disabled={pending}
          aria-disabled={pending}
          aria-describedby={state.status === "error" ? `${id}-error ${id}-note` : `${id}-note`}
        >
          {pending ? "Signing in…" : "Use the demo account"}
        </Button>
      </form>
      {state.status === "error" ? (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-incorrect">
          {state.error}
        </p>
      ) : null}
    </section>
  );
}
