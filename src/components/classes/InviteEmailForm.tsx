"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InviteUnavailable } from "./InviteUnavailable";

export type InviteLinkState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; error: string }
  | { status: "invalid" };

export interface InviteEmailFormProps {
  action: (state: InviteLinkState, formData: FormData) => Promise<InviteLinkState>;
  /** The class the link is for, as the server resolved it. */
  classTitle: string;
}

const INITIAL: InviteLinkState = { status: "idle" };

/**
 * The class invite for someone not signed in (#205): one email field. The answer is the same
 * "Check your email" whether the address is new or already has an account.
 */
export function InviteEmailForm({ action, classTitle }: InviteEmailFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [email, setEmail] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const error = state.status === "error" ? state.error : null;

  useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
    if (state.status === "sent") headingRef.current?.focus();
  }, [state]);

  if (state.status === "invalid") return <InviteUnavailable />;

  if (state.status === "sent") {
    return (
      <section aria-labelledby={`${id}-sent`}>
        <p className="mb-2 font-mono text-sm tracking-wide text-ink-2 uppercase">{classTitle}</p>
        <h1
          id={`${id}-sent`}
          ref={headingRef}
          tabIndex={-1}
          className="mb-3 font-read text-3xl text-ink-1 outline-none"
        >
          Check your email
        </h1>
        <p className="text-ink-2">
          We sent a link to {state.email}. Open it to finish joining. It works once and expires in
          an hour.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h1 id={`${id}-heading`} className="mb-3 font-read text-3xl text-ink-1">
        Join {classTitle}
      </h1>
      <p className="mb-6 text-ink-2">
        Enter your email and we will send you a link. Opening it signs you in and adds you to the
        class.
      </p>
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-email`} className="text-sm font-medium text-ink-1">
            Email address
          </label>
          <input
            ref={inputRef}
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            className="tap-target w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect"
          />
          {error ? (
            <p id={`${id}-error`} role="alert" className="text-sm text-incorrect">
              {error}
            </p>
          ) : null}
        </div>
        <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
          {pending ? "Sending link…" : "Email me a link to join"}
        </Button>
      </form>
    </section>
  );
}
