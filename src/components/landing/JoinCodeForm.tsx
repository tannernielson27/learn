"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { openJoinCode } from "@/app/join/codeActions";
import { FieldError } from "@/components/authoring/FieldError";
import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { SESSION_CODE_LENGTH } from "@/lib/live/sessionCode";

/** A refusal carries what was typed, so the field still shows it after React resets the form. */
export type JoinCodeState = { status: "idle" } | { status: "error"; error: string; typed: string };

export interface JoinCodeFormProps {
  /** The landing page's Server Function (`openJoinCode`); a test passes its own. */
  action?: (state: JoinCodeState, formData: FormData) => Promise<JoinCodeState>;
  /** The line over the field. The landing page's says that no account is needed. */
  note?: string;
}

const INITIAL: JoinCodeState = { status: "idle" };

/**
 * The student's door on the landing page (#563): the join code alone, and Join. The code is read
 * with the join form's own rule on the server and sent on to `/join/[code]`, which fills it in and
 * asks for a name, the page a QR code opens. One form posting to a Server Function, so it works
 * without JavaScript; with it, a refusal comes back under the field without leaving the page.
 *
 * It never takes focus on its own: the landing page is read first, by a teacher as often as not.
 * The student home (#563) puts the same form first, with its own `note`.
 */
export function JoinCodeForm({
  action = openJoinCode,
  note = "In class now? No account needed.",
}: JoinCodeFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const id = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const error = state.status === "error" ? state.error : null;

  useEffect(() => {
    if (state.status === "error") fieldRef.current?.focus();
  }, [state]);

  const noteId = `${id}-note`;
  const errorId = `${id}-error`;

  return (
    <form action={formAction} aria-label="Join a live session" className="flex flex-col gap-3">
      <p id={noteId} className="font-semibold text-ink-1">
        {note}
      </p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-code`} className="text-sm font-medium text-ink-2">
          Join code
        </label>
        <div className="flex gap-2">
          <input
            ref={fieldRef}
            // Keyed on the refusal, so a second refusal of the same code still refills the field.
            key={error ? `refused-${state.status === "error" ? state.typed : ""}` : "field"}
            id={`${id}-code`}
            defaultValue={state.status === "error" ? state.typed : ""}
            name="code"
            type="text"
            required
            // Six characters, with room for the spaced form people copy off a screen: "ABC DEF".
            maxLength={SESSION_CODE_LENGTH + 3}
            size={SESSION_CODE_LENGTH + 3}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="ABC DEF"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${noteId} ${errorId}` : noteId}
            className={fieldClasses(
              "min-w-0 flex-1 px-4 font-mono text-xl font-semibold tracking-[0.2em] uppercase placeholder:font-normal placeholder:tracking-[0.2em] placeholder:text-ink-2",
            )}
          />
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={pending}
            aria-disabled={pending}
          >
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
