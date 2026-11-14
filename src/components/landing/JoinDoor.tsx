"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/authoring/FieldError";
import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { readJoinCode } from "@/lib/live/joinForm";
import { JOIN_PATH } from "@/lib/live/routes";
import { SESSION_CODE_LENGTH } from "@/lib/live/sessionCode";

/**
 * The student's way in from the front page (#563): the join code and Join, and nothing else.
 *
 * Without JavaScript it is a plain GET form to `/join`, which sends a good code on to
 * `/join/[code]` and says what is wrong with any other. With JavaScript the same check
 * (`readJoinCode`) runs here first, so a mistyped code is said at the field without a round trip,
 * and a good one goes straight to `/join/[code]`. Either way the student finishes on the one join
 * screen, with the code filled in and only their name to type.
 */
export function JoinDoor() {
  const router = useRouter();
  const id = useId();
  const field = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = readJoinCode(new FormData(event.currentTarget).get("code"));
    if (!typed.ok) {
      setError(typed.error);
      field.current?.focus();
      return;
    }
    setError(null);
    router.push(typed.href);
  }

  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="rounded-md border border-line bg-surface-1"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 sm:px-5">
        <h2
          id={`${id}-heading`}
          className="font-mono text-xs font-semibold tracking-[0.08em] text-brand uppercase"
        >
          Join a live session
        </h2>
        <p aria-hidden="true" className="font-mono text-xs text-ink-2 tabular">
          Students
        </p>
      </div>
      <form
        action={JOIN_PATH}
        method="get"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-2 px-4 pt-3 pb-4 sm:px-5 sm:pb-5"
      >
        <p className="font-semibold text-ink-1">In class now? No account needed.</p>
        <label htmlFor={`${id}-code`} className="mt-1 text-sm font-medium text-ink-1">
          Join code
        </label>
        <div className="flex gap-2">
          <input
            ref={field}
            id={`${id}-code`}
            name="code"
            type="text"
            // Long enough for the spaced form people copy off a screen: "ABC DEF".
            maxLength={SESSION_CODE_LENGTH + 3}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            onChange={() => setError(null)}
            className={fieldClasses(
              "min-h-(--button-height-lg) min-w-0 flex-1 px-3 font-mono text-xl font-semibold tracking-[0.2em] uppercase",
            )}
          />
          <Button type="submit" variant="primary" size="lg">
            Join
          </Button>
        </div>
        {error ? (
          <FieldError id={errorId} role="alert">
            {error}
          </FieldError>
        ) : null}
        <p id={hintId} className="text-sm text-ink-2">
          {SESSION_CODE_LENGTH} characters, on the screen at the front of the class.
        </p>
      </form>
    </section>
  );
}
