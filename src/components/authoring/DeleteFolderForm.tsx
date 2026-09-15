"use client";

import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import type { FolderFormState } from "./FolderNameForm";

export interface DeleteFolderFormProps {
  /** Deletes the open folder and opens its parent, or says what is still inside it. */
  action: (state: FolderFormState, formData: FormData) => Promise<FolderFormState>;
}

const INITIAL: FolderFormState = { status: "idle" };

export function DeleteFolderForm({ action }: DeleteFolderFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const alertRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (state.status === "error") alertRef.current?.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div>
        <Button type="submit" size="sm" disabled={pending}>
          Delete folder
        </Button>
      </div>
      {state.status === "error" ? (
        <p ref={alertRef} role="alert" tabIndex={-1} className="text-sm text-incorrect">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
