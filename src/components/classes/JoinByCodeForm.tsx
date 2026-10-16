"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { ALREADY_INSTRUCTOR } from "./JoinClassButton";

export type JoinByCodeState =
  { status: "idle" } | { status: "instructor" } | { status: "error"; error: string };

export interface JoinByCodeFormProps {
  /** `joinClassWithCode`; on success it redirects, so only a refusal comes back. */
  action: (state: JoinByCodeState, formData: FormData) => Promise<JoinByCodeState>;
  /** A code that came with the person (`/welcome?code=`), already checked for shape. */
  initialCode?: string;
}

const INITIAL: JoinByCodeState = { status: "idle" };
const HINT = "Like ABCD-2345. Your teacher has it.";

/**
 * One field for a class code (#362). It takes the code however it is typed: with or without the
 * hyphen, in either case. The server reads it; nothing here decides whether a code is right.
 */
export function JoinByCodeForm({ action, initialCode = "" }: JoinByCodeFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  // Held here so the code survives React resetting the form after an answer that asks again.
  const [code, setCode] = useState(initialCode);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const error = state.status === "error" ? state.error : null;

  useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
  }, [state]);

  if (state.status === "instructor") {
    return (
      <div role="status" className="flex flex-col items-start gap-2">
        <p className="text-ink-1">{ALREADY_INSTRUCTOR}</p>
        <Link
          href="/author"
          className="tap-target inline-flex items-center text-sm font-medium text-accent-ink hover:underline"
        >
          Go to your quizzes
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-code`} className="text-sm font-medium text-ink-1">
          Class code
        </label>
        <input
          ref={inputRef}
          id={`${id}-code`}
          name="code"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={32}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(" ")}
          className={fieldClasses("max-w-64 px-3 font-mono text-base tracking-wide uppercase")}
        />
        <p id={hintId} className="text-sm text-ink-2">
          {HINT}
        </p>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-sm text-incorrect">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
          {pending ? "Joining…" : "Join the class"}
        </Button>
      </div>
    </form>
  );
}
