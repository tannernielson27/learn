"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { DisplayNameField } from "./DisplayNameField";

export type AccountNameState =
  { status: "idle" } | { status: "saved"; name: string } | { status: "error"; error: string };

export interface AccountNameFormProps {
  action: (state: AccountNameState, formData: FormData) => Promise<AccountNameState>;
  /** The name the account has now, or null for none yet. */
  name: string | null;
}

const INITIAL: AccountNameState = { status: "idle" };
export const ACCOUNT_PAGE_NAME_HINT = "Shown at the top of each page and on class rosters.";

/** Names or renames the signed-in account (#358). The form stays put; a line says it saved. */
export function AccountNameForm({ action, name }: AccountNameFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const errorId = `${id}-error`;
  const error = state.status === "error" ? state.error : null;
  // React resets a form after its action; the field then shows what was saved.
  const current = state.status === "saved" ? state.name : (name ?? "");

  useEffect(() => {
    if (state.status === "error") inputRef.current?.focus();
  }, [state]);

  return (
    <div>
      <form action={formAction} className="flex flex-col gap-4">
        <DisplayNameField
          id={`${id}-name`}
          defaultValue={current}
          hint={ACCOUNT_PAGE_NAME_HINT}
          inputRef={inputRef}
          invalid={error !== null}
          errorId={error ? errorId : undefined}
        />
        {error ? (
          <p id={errorId} role="alert" className="text-sm text-incorrect">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
          {pending ? "Saving…" : "Save name"}
        </Button>
      </form>
      {/* Always in the page, so a screen reader hears it when it fills. */}
      <p role="status" className="mt-3 min-h-5 text-sm text-ink-2">
        {state.status === "saved" ? "Name saved." : ""}
      </p>
    </div>
  );
}
