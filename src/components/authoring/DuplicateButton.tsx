"use client";

import { useActionState, useEffect, useRef, type FormEvent } from "react";
import { MENU_ITEM_CLASSES } from "@/components/ui/AccountMenu";
import { Button } from "@/components/ui/Button";
import { useAskToLeave } from "./LeaveGuard";
import { FieldError } from "./FieldError";

export type DuplicateState = { status: "idle" } | { status: "error"; error: string };

export interface DuplicateButtonProps {
  /** Makes the copy and opens it in its editor, or says why it could not. */
  action: (state: DuplicateState) => Promise<DuplicateState>;
  /** The button's name, e.g. "Duplicate item". */
  label: string;
  /** `menu`: a row in a More menu (the editor's, #563), the account menu's look; else a button. */
  appearance?: "button" | "menu";
}

/** A row in a More menu: the account menu's rows, greyed while the copy is made. */
export const MENU_ROW_CLASSES = `${MENU_ITEM_CLASSES} disabled:cursor-not-allowed disabled:text-ink-2`;

const INITIAL: DuplicateState = { status: "idle" };

export function DuplicateButton({ action, label, appearance = "button" }: DuplicateButtonProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Set once the author has agreed to discard unsaved work, so the resubmit is not asked again.
  const agreed = useRef(false);
  const askToLeave = useAskToLeave();

  // The copy is made from the saved version and opens in place of this page, so unsaved work on
  // the page would be lost: ask first, as a link out would.
  function submit(event: FormEvent<HTMLFormElement>) {
    if (agreed.current) {
      agreed.current = false;
      return;
    }
    const stay = askToLeave(window.location.pathname, () => {
      agreed.current = true;
      formRef.current?.requestSubmit();
    });
    if (stay) event.preventDefault();
  }

  useEffect(() => {
    if (state.status === "error") alertRef.current?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} onSubmit={submit} className="flex flex-col gap-2">
      {appearance === "menu" ? (
        <button type="submit" disabled={pending} className={MENU_ROW_CLASSES}>
          {label}
        </button>
      ) : (
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            {label}
          </Button>
        </div>
      )}
      {state.status === "error" ? (
        <FieldError ref={alertRef} role="alert" tabIndex={-1}>
          {state.error}
        </FieldError>
      ) : null}
    </form>
  );
}
