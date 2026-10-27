"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { DisplayNameField } from "@/components/auth/DisplayNameField";
import { PasswordField } from "@/components/auth/PasswordField";
import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from "@/lib/auth/passwordRules";
import { STUDENT_HOME } from "@/lib/classes/classes";
import { InviteUnavailable } from "./InviteUnavailable";
import { AUTH_HEADING, AUTH_SUBLINE } from "@/components/auth/AuthFrame";
import { FormError } from "@/components/auth/FormError";
import { textLinkClasses } from "@/components/ui/TextLink";

export type InviteSignUpState =
  | { status: "idle" }
  | { status: "error"; error: string; field: "displayName" | "email" | "password" }
  /** The address has an account, and the password typed is not that account's. */
  | { status: "exists"; email: string }
  /** The account was made but this browser could not be signed in to it. */
  | { status: "created_signed_out" }
  | { status: "invalid" };

export interface InviteSignUpFormProps {
  /** `signUpWithPassword`, bound to the token; on success it redirects. */
  action: (state: InviteSignUpState, formData: FormData) => Promise<InviteSignUpState>;
  /** The class the link is for, as the server resolved it. */
  classTitle: string;
  /** Held by the panel, so the address survives a switch to the emailed link. */
  email: string;
  onEmailChange: (email: string) => void;
  autoFocus?: boolean;
}

const INITIAL: InviteSignUpState = { status: "idle" };
const FIELD = fieldClasses("h-13 px-3.5 text-lg");

function existsMessage(email: string): string {
  return `${email} already has a LeaRN account, and that is not its password. Try its password again, or join with an emailed link.`;
}

/**
 * The class invite for someone not signed in: an email address and a password, and they are in.
 * The same two fields serve a new student and one who already has an account, so nobody has to
 * know which they are before they start.
 */
export function InviteSignUpForm({
  action,
  classTitle,
  email,
  onEmailChange,
  autoFocus = false,
}: InviteSignUpFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [name, setName] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const readyRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const errorId = `${id}-error`;

  const error =
    state.status === "error"
      ? { message: state.error, field: state.field }
      : state.status === "exists"
        ? { message: existsMessage(state.email), field: "password" as const }
        : null;

  useEffect(() => {
    if (state.status === "created_signed_out") readyRef.current?.focus();
    if (state.status === "exists") passwordRef.current?.focus();
    if (state.status === "error") {
      const fields = { displayName: nameRef, email: emailRef, password: passwordRef };
      fields[state.field].current?.focus();
    }
  }, [state]);

  if (state.status === "invalid") return <InviteUnavailable />;

  if (state.status === "created_signed_out") {
    return (
      <section aria-labelledby={`${id}-ready`}>
        <h1
          id={`${id}-ready`}
          ref={readyRef}
          tabIndex={-1}
          className={`${AUTH_HEADING} outline-none`}
        >
          Your account is ready
        </h1>
        <p className={AUTH_SUBLINE}>You’re in {classTitle}.</p>
        <Link
          href={`/sign-in?next=${encodeURIComponent(STUDENT_HOME)}`}
          className={textLinkClasses()}
        >
          Sign in
        </Link>
      </section>
    );
  }

  return (
    <section aria-labelledby={`${id}-heading`}>
      <h1 id={`${id}-heading`} className={AUTH_HEADING}>
        Join {classTitle}
      </h1>
      <p className={AUTH_SUBLINE}>Already have an account? Use its password.</p>
      <form action={formAction} className="flex flex-col gap-5">
        <DisplayNameField
          id={`${id}-name`}
          value={name}
          onValueChange={setName}
          autoFocus={autoFocus}
          inputRef={nameRef}
          invalid={error?.field === "displayName"}
          errorId={error?.field === "displayName" ? errorId : undefined}
        />
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-email`} className="text-sm font-semibold text-ink-1">
            Email address
          </label>
          <input
            ref={emailRef}
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            aria-invalid={error?.field === "email" ? true : undefined}
            aria-describedby={error?.field === "email" ? errorId : undefined}
            className={FIELD}
          />
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
        {error ? <FormError id={errorId}>{error.message}</FormError> : null}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          disabled={pending}
          aria-disabled={pending}
        >
          {pending ? "Joining…" : "Join the class"}
        </Button>
      </form>
    </section>
  );
}
