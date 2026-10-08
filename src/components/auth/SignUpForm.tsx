"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ACCOUNT_NAME_HINT } from "@/lib/auth/displayName";
import { PASSWORD_HINT, PASSWORD_MIN_LENGTH } from "@/lib/auth/passwordRules";
import type { SignUpRole } from "@/lib/auth/signUp";
import { SIGN_UP_CAPTCHA_ACTION } from "@/lib/auth/turnstile";
import { CaptchaField } from "./CaptchaField";
import { DisplayNameField } from "./DisplayNameField";
import { PasswordField } from "./PasswordField";

export type SignUpField = "role" | "displayName" | "email" | "password" | "captcha";

export type SignUpState =
  | { status: "idle" }
  | { status: "error"; error: string; field: SignUpField }
  /** The address has an account. Nothing else about it is said. */
  | { status: "exists"; email: string }
  /** The account was made but this browser could not be signed in to it. */
  | { status: "created_signed_out"; next: string };

export interface SignUpFormProps {
  /** `createAccount`; on success it redirects, so only a refusal comes back. */
  action: (state: SignUpState, formData: FormData) => Promise<SignUpState>;
  /** From `/sign-up?role=`, already checked by the page. */
  initialRole: SignUpRole | null;
  /** From `/sign-up?code=`, already checked by the page; carried through for a student. */
  classCode: string | null;
  /** `captchaSiteKey()` from the page. Null draws no widget. */
  captchaSiteKey: string | null;
}

/** The action's answer, numbered, so the CAPTCHA can tell one answer from the next. */
interface Answered {
  state: SignUpState;
  attempt: number;
}

const INITIAL: Answered = { state: { status: "idle" }, attempt: 0 };
const FIELD =
  "tap-target w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";
const CHOICE =
  "tap-target flex cursor-pointer items-center gap-3 rounded-sm border border-line bg-surface-1 px-3 py-3 text-base text-ink-1 transition-colors duration-fast hover:border-line-strong has-checked:border-accent has-checked:bg-accent-soft";
const LINK =
  "tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline";

const ROLES: readonly { value: SignUpRole; label: string; detail: string }[] = [
  { value: "teacher", label: "I teach", detail: "Write questions and run them with a class." },
  { value: "student", label: "I am a student", detail: "Join your instructor’s class." },
];

const NAME_HINT: Record<SignUpRole, string> = {
  teacher: "Shown at the top of each page, and in the name of your workspace.",
  student: ACCOUNT_NAME_HINT,
};

/**
 * Open sign-up (#361): the role first, then a name, an email address and a password. The fields
 * wait for the role because what they say depends on it; the choice stays above them and can be
 * changed. Whatever was typed survives an answer that asks for another try, except the password.
 */
export function SignUpForm({ action, initialRole, classCode, captchaSiteKey }: SignUpFormProps) {
  const [answered, formAction, pending] = useActionState(
    async (previous: Answered, formData: FormData): Promise<Answered> => ({
      state: await action(previous.state, formData),
      attempt: previous.attempt + 1,
    }),
    INITIAL,
  );
  const { state, attempt } = answered;
  const [role, setRole] = useState<SignUpRole | null>(initialRole);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const roleRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const readyRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const errorId = `${id}-error`;

  const error = state.status === "error" ? state : null;
  const exists = state.status === "exists" ? state : null;

  useEffect(() => {
    if (state.status === "created_signed_out") readyRef.current?.focus();
    if (state.status === "exists") emailRef.current?.focus();
    if (state.status === "error") {
      const fields = {
        role: roleRef,
        displayName: nameRef,
        email: emailRef,
        password: passwordRef,
        // The widget is Cloudflare's own frame; the alert says what happened.
        captcha: null,
      };
      fields[state.field]?.current?.focus();
    }
  }, [state]);

  if (state.status === "created_signed_out") {
    return (
      <section aria-labelledby={`${id}-ready`}>
        <h2
          id={`${id}-ready`}
          ref={readyRef}
          tabIndex={-1}
          className="mb-3 font-read text-2xl text-ink-1 outline-none"
        >
          Your account is ready
        </h2>
        <p className="mb-4 text-ink-2">
          Sign in with the email address and password you just chose.
        </p>
        <Link href={`/sign-in?next=${encodeURIComponent(state.next)}`} className={LINK}>
          Sign in
        </Link>
      </section>
    );
  }

  const emailInvalid = error?.field === "email" || exists !== null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={error?.field === "role" ? errorId : undefined}
      >
        <legend className="mb-2 text-sm font-medium text-ink-1">Which are you?</legend>
        {ROLES.map((option, index) => (
          <label key={option.value} className={CHOICE}>
            <input
              ref={index === 0 ? roleRef : undefined}
              type="radio"
              name="role"
              value={option.value}
              required
              checked={role === option.value}
              onChange={() => setRole(option.value)}
              className="size-5 shrink-0 accent-accent"
            />
            <span className="flex flex-col">
              <span className="font-medium">{option.label}</span>
              <span className="text-sm text-ink-2">{option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {role ? (
        <div className="motion-enter flex flex-col gap-4">
          {role === "student" && classCode ? (
            <input type="hidden" name="code" value={classCode} />
          ) : null}
          <DisplayNameField
            id={`${id}-name`}
            value={name}
            onValueChange={setName}
            hint={NAME_HINT[role]}
            inputRef={nameRef}
            invalid={error?.field === "displayName"}
            errorId={error?.field === "displayName" ? errorId : undefined}
          />
          <div className="flex flex-col gap-2">
            <label htmlFor={`${id}-email`} className="text-sm font-medium text-ink-1">
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
              onChange={(event) => setEmail(event.target.value)}
              aria-invalid={emailInvalid ? true : undefined}
              aria-describedby={emailInvalid ? errorId : undefined}
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
          <CaptchaField
            siteKey={captchaSiteKey}
            action={SIGN_UP_CAPTCHA_ACTION}
            resetKey={attempt}
          />
        </div>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-incorrect">
          {error.error}
        </p>
      ) : null}
      {exists ? (
        <p id={errorId} role="alert" className="text-sm text-incorrect">
          This email already has an account.{" "}
          <Link href="/sign-in" className="font-medium text-accent-ink underline">
            Sign in
          </Link>
        </p>
      ) : null}

      {role ? (
        <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
          {pending ? "Creating your account…" : "Create account"}
        </Button>
      ) : null}
    </form>
  );
}
