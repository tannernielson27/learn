"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { DisplayNameField } from "@/components/auth/DisplayNameField";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/Button";
import { DEFAULT_AFTER_SIGN_IN } from "@/lib/auth/nextPath";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from "@/lib/auth/passwordRules";
import type { InviteAccountState } from "@/lib/workspace/invite";
import { InviteAnswerView } from "./InviteAnswerView";

export interface AcceptInviteFormProps {
  /** `createAccountAndAccept`, bound to the token; on success it redirects. */
  action: (state: InviteAccountState, formData: FormData) => Promise<InviteAccountState>;
  /** "Ada Lovelace invited you to teach in ...", from the page. Text only. */
  heading: string;
  /** The address the invitation was sent to. Shown, never posted: the server uses its own copy. */
  invitedEmail: string;
  /** Sign-in, coming back to this invitation. */
  signInHref: string;
}

const INITIAL: InviteAccountState = { status: "idle" };
const LINK =
  "tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline";
const FIELD =
  "tap-target w-full rounded-sm border border-line bg-surface-2 px-3 text-base text-ink-2";

export const INVITE_NAME_HINT = "The teachers you work with and your students see this.";
export const INVITE_ACCOUNT_EXISTS =
  "This email address already has a LeaRN account. Sign in to it, and the invitation will be waiting.";

/**
 * The invitation for someone not signed in: a name and a password, and they have an account on the
 * invited address and are in the workspace. The address is fixed. It is shown in a read-only field
 * with no name, so the form does not post it and the server never reads one from here.
 */
export function AcceptInviteForm({
  action,
  heading,
  invitedEmail,
  signInHref,
}: AcceptInviteFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const noticeRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const errorId = `${id}-error`;

  useEffect(() => {
    if (state.status === "created_signed_out" || state.status === "exists") {
      noticeRef.current?.focus();
    }
    if (state.status === "error") {
      if (state.field === "displayName") nameRef.current?.focus();
      if (state.field === "password") passwordRef.current?.focus();
    }
  }, [state]);

  if (state.status === "invalid" || state.status === "closed" || state.status === "refused") {
    return <InviteAnswerView answer={state} />;
  }

  if (state.status === "created_signed_out" || state.status === "exists") {
    const made = state.status === "created_signed_out";
    return (
      <section aria-labelledby={`${id}-notice`}>
        <h1
          id={`${id}-notice`}
          ref={noticeRef}
          tabIndex={-1}
          className="mb-3 font-read text-3xl break-words text-ink-1 outline-none"
        >
          {made ? "Your account is ready" : "You already have an account"}
        </h1>
        <p className="mb-6 text-ink-2">
          {made
            ? "You are in the workspace. Sign in with your email address and the password you just chose."
            : INVITE_ACCOUNT_EXISTS}
        </p>
        <Link
          href={made ? `/sign-in?next=${encodeURIComponent(DEFAULT_AFTER_SIGN_IN)}` : signInHref}
          className={LINK}
        >
          Sign in
        </Link>
      </section>
    );
  }

  const error = state.status === "error" ? state : null;

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h1 id={`${id}-heading`} className="mb-3 font-read text-3xl break-words text-ink-1">
        {heading}
      </h1>
      <p className="mb-6 text-ink-2">
        Enter your name and choose a password to make your account and join the workspace.
      </p>
      <form action={formAction} className="flex flex-col gap-4">
        <DisplayNameField
          id={`${id}-name`}
          value={name}
          onValueChange={setName}
          hint={INVITE_NAME_HINT}
          inputRef={nameRef}
          invalid={error?.field === "displayName"}
          errorId={error?.field === "displayName" ? errorId : undefined}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-email`} className="text-sm font-medium text-ink-1">
            Email address
          </label>
          <input
            id={`${id}-email`}
            type="email"
            autoComplete="username"
            readOnly
            value={invitedEmail}
            aria-describedby={`${id}-email-hint`}
            className={FIELD}
          />
          <p id={`${id}-email-hint`} className="text-sm text-ink-2">
            The invitation was sent to this address, so the account is made on it.
          </p>
        </div>
        <PasswordField
          id={`${id}-password`}
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          minLength={PASSWORD_MIN_LENGTH}
          inputRef={passwordRef}
          invalid={error?.field === "password"}
          errorId={error?.field === "password" ? errorId : undefined}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-incorrect">
            {error.error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
          {pending ? "Joining…" : "Create account and join"}
        </Button>
      </form>
      <p className="mt-6 border-t border-line pt-4 text-sm text-ink-2">
        Already have a LeaRN account on this address?{" "}
        <Link href={signInHref} className={LINK}>
          Sign in to accept
        </Link>
      </p>
    </section>
  );
}
