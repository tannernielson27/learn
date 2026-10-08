"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";

export type WorkspaceState = { status: "idle" } | { status: "error"; error: string };

export interface SetUpWorkspaceProps {
  /** `setUpWorkspace`; on success it redirects, so only a refusal comes back. */
  action: () => Promise<WorkspaceState>;
}

const INITIAL: WorkspaceState = { status: "idle" };

/** The welcome page's second try at a teacher's workspace (#361). */
export function SetUpWorkspace({ action }: SetUpWorkspaceProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  return (
    <form action={formAction} className="flex flex-col items-start gap-3">
      <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
        {pending ? "Setting up…" : "Set up my workspace"}
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-incorrect">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
