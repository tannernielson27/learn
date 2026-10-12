"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { JoinWorkspaceState } from "@/lib/workspace/invite";
import {
  MOVE_CONFIRM_FIELD,
  MOVE_LEAVING_FIELD,
  moveConfirmLabel,
  type MovePreview,
  moveWarning,
} from "@/lib/workspace/membership";
import { InviteAnswerView } from "./InviteAnswerView";

export interface MoveWorkspaceFormProps {
  /** `moveToInvitedWorkspace`, bound to the token; on success it redirects. */
  action: (state: JoinWorkspaceState, formData: FormData) => Promise<JoinWorkspaceState>;
  /** "Ada Lovelace invited you to teach in ...", from the page. Text only. */
  heading: string;
  /** The signed-in account's address, so nobody accepts as the wrong person by accident. */
  email: string;
  /** The workspace this account would leave and what it holds. Its name is text only. */
  preview: MovePreview;
}

const INITIAL: JoinWorkspaceState = { status: "idle" };

/**
 * The invitation for someone signed in as the invited address who already teaches in a workspace
 * of their own (ADR 0011). Accepting moves them, so the page first names the workspace they would
 * leave, counts what they lose access to, and has them tick a box that says so.
 *
 * The box is `required`, which is the browser being helpful. What makes it count is the server:
 * the action sends the database whether the box was ticked and which workspace the page named,
 * and the database answers a move that was not confirmed for the workspace the account is in with
 * `move_needs_confirmation` and writes nothing.
 */
export function MoveWorkspaceForm({ action, heading, email, preview }: MoveWorkspaceFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL);

  if (state.status !== "idle" && state.status !== "error") {
    return <InviteAnswerView answer={state} />;
  }

  return (
    <section aria-labelledby="move-workspace-heading">
      <h1 id="move-workspace-heading" className="mb-3 font-read text-3xl break-words text-ink-1">
        {heading}
      </h1>
      <p className="mb-4 break-words text-ink-2">You are signed in as {email}.</p>
      <div className="mb-6 border-l-2 border-line-strong pl-4">
        <h2 className="mb-1 font-medium text-ink-1">Joining means leaving your workspace</h2>
        <p className="break-words text-ink-2">{moveWarning(preview)}</p>
      </div>
      <form action={formAction} className="flex flex-col gap-4">
        {/* Which workspace the sentence above is about: the confirmation counts only for it. */}
        <input type="hidden" name={MOVE_LEAVING_FIELD} value={preview.leavingWorkspaceId} />
        <label className="tap-target flex items-start gap-3 break-words text-ink-1">
          <input
            type="checkbox"
            name={MOVE_CONFIRM_FIELD}
            required
            className="mt-1 size-5 shrink-0 accent-accent"
          />
          <span className="min-w-0">{moveConfirmLabel(preview)}</span>
        </label>
        {state.status === "error" ? (
          <p role="alert" className="text-sm text-incorrect">
            {state.error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={pending} aria-disabled={pending}>
          {pending ? "Joining…" : "Leave and join workspace"}
        </Button>
      </form>
    </section>
  );
}
