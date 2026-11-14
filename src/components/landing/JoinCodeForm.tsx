"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { FieldError } from "@/components/authoring/FieldError";
import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { checkJoinCode } from "@/lib/live/joinForm";
import { JOIN_PATH, joinPath } from "@/lib/live/routes";
import { SESSION_CODE_LENGTH } from "@/lib/live/sessionCode";

/**
 * The student's door on the landing page (#563): a join code and Join, nothing else. It goes to
 * the same join page the QR code opens (`/join/[code]`), where the student adds a display name.
 *
 * A plain GET form to `/join` underneath, so it works without JavaScript: `/join?code=` checks the
 * code the same way and sends a good one on. With JavaScript the code is checked here first, by
 * the same `checkJoinCode`, so an empty or impossible code is named beside the field at once.
 * The browser's own validation is off for the same reason: one message, in the product's words.
 */
export function JoinCodeForm() {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checked = checkJoinCode(input.current?.value ?? "");
    if (!checked.ok) {
      setError(checked.error);
      input.current?.focus();
      return;
    }
    setError(null);
    router.push(joinPath(checked.code));
  }

  const errorId = `${id}-error`;
  return (
    <form
      method="get"
      action={JOIN_PATH}
      noValidate
      onSubmit={submit}
      aria-labelledby={`${id}-heading`}
      className="flex flex-col gap-3"
    >
      <p id={`${id}-heading`} className="font-semibold text-ink-1">
        In class now? No account needed.
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-code`} className="text-sm font-medium text-ink-2">
          Join code
        </label>
        <div className="flex gap-2">
          <input
            ref={input}
            id={`${id}-code`}
            name="code"
            type="text"
            // As on the join page: long enough for the spaced form copied off a screen, "ABC DEF".
            maxLength={SESSION_CODE_LENGTH + 3}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={() => setError(null)}
            className={fieldClasses(
              "min-h-(--button-height-lg) min-w-0 flex-1 px-3 font-mono text-xl font-semibold tracking-[0.18em] uppercase",
            )}
          />
          <Button type="submit" variant="primary" size="lg" className="shrink-0">
            Join
          </Button>
        </div>
      </div>
      {error ? (
        <FieldError id={errorId} role="alert">
          {error}
        </FieldError>
      ) : null}
    </form>
  );
}
