"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { JoinWorkspaceState } from "@/lib/workspace/invite";
import { InviteAnswerView } from "./InviteAnswerView";
import { AUTH_HEADING, AUTH_SUBLINE } from "@/components/auth/AuthFrame";
import { FormError } from "@/components/auth/FormError";

export interface JoinWorkspaceButtonProps {
  /** `acceptInvitation`, bound to the token; on success it redirects. */
  action: (state: JoinWorkspaceState, formData: FormData) => Promise<JoinWorkspaceState>;
  /** "Ada Lovelace invited you to teach in ...", from the page. Text only. */
  heading: string;
  /** The signed-in account's address, so nobody accepts as the wrong person by accident. */
  email: string;
}

const INITIAL: JoinWorkspaceState = { status: "idle" };

/**
 * The invitation for someone already signed in as the invited address: one button. A form post,
 * so opening the link (as a mail scanner does) accepts nothing.
 */
export function JoinWorkspaceButton({ action, heading, email }: JoinWorkspaceButtonProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (state.status !== "idle" && state.status !== "error") {
    return <InviteAnswerView answer={state} />;
  }

  return (
    <section aria-labelledby="join-workspace-heading">
      <h1 id="join-workspace-heading" className={AUTH_HEADING}>
        {heading}
      </h1>
      <p className={AUTH_SUBLINE}>
        You are signed in as {email}. Joining makes this account a teacher in the workspace.
      </p>
      <form action={formAction} className="flex flex-col gap-3">
        {state.status === "error" ? <FormError>{state.error}</FormError> : null}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          disabled={pending}
          aria-disabled={pending}
        >
          {pending ? "Joining…" : "Join workspace"}
        </Button>
      </form>
    </section>
  );
}
