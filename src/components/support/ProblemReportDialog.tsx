"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { usePathname } from "next/navigation";
import { FormError } from "@/components/auth/FormError";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Textarea";
import {
  PROBLEM_FIELDS,
  PROBLEM_IDLE,
  PROBLEM_LABEL,
  PROBLEM_MESSAGE_MAX,
  type ProblemReportState,
} from "@/lib/support/problemReportForm";
import { EmailSupport } from "./EmailSupport";
import type { ProblemReportActions } from "./ProblemReportProvider";

/** Whether the form can be sent here: yes, no (offer email), or still asking (`check`). */
export type ProblemAccess = "signed-in" | "signed-out" | "checking";

export interface ProblemReportDialogProps {
  open: boolean;
  onClose: () => void;
  access: ProblemAccess;
  send: ProblemReportActions["send"];
  /** The error screen's reference and Sentry event id, when opened from one. */
  reference?: string;
  eventId?: string;
  /** The gallery's way to show a state without sending anything. */
  initialState?: ProblemReportState;
}

/**
 * "Tell us about a problem" (#568): one box, "What happened?", sent to support@ by the server action.
 * Which page, which error and who is asking are added for the person, so they only say what they saw.
 *
 * The form is remounted each time the dialog opens (`key` in the opener), so it starts empty.
 * Errors come back in a neutral notice and move focus to the box (docs/04 §11); a sent message
 * replaces the form with a thank-you, read out through `role="status"`.
 */
export function ProblemReportDialog({
  open,
  onClose,
  access,
  send,
  reference,
  eventId,
  initialState = PROBLEM_IDLE,
}: ProblemReportDialogProps) {
  const [state, formAction, pending] = useActionState(send, initialState);
  const pathname = usePathname() ?? "/";
  const box = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const formId = `${id}-form`;
  const errorId = `${id}-error`;
  const sent = state.status === "sent";
  const signedOut = access === "signed-out" || state.status === "signed_out";
  const error =
    state.status === "invalid" || state.status === "rate_limited" || state.status === "error"
      ? state.error
      : null;

  useEffect(() => {
    if (state.status === "invalid" || state.status === "error") box.current?.focus();
  }, [state]);

  const canSend = access === "signed-in" && !sent && !signedOut;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={PROBLEM_LABEL}
      description={
        canSend ? "Say what you were doing and what went wrong. We read every one." : undefined
      }
      actions={
        canSend ? (
          <>
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="primary" busy={pending}>
              Send
            </Button>
          </>
        ) : (
          // Not "Close": the dialog's own close button already has that name.
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      {access === "checking" ? (
        <p role="status" className="text-ink-2">
          Checking you are signed in…
        </p>
      ) : signedOut ? (
        <EmailSupport lead="Sign in to send this from here." />
      ) : sent ? null : (
        <form id={formId} action={formAction} className="flex flex-col gap-4">
          <Textarea
            ref={box}
            name={PROBLEM_FIELDS.message}
            label="What happened?"
            hint={reference ? `We will include the reference ${reference}.` : undefined}
            required
            maxLength={PROBLEM_MESSAGE_MAX}
            error={state.status === "invalid" ? state.error : undefined}
            aria-describedby={error && state.status !== "invalid" ? errorId : undefined}
          />
          {error && state.status !== "invalid" ? <FormError id={errorId}>{error}</FormError> : null}
          <input type="hidden" name={PROBLEM_FIELDS.page} value={pathname} />
          <input type="hidden" name={PROBLEM_FIELDS.reference} value={reference ?? ""} />
          <input type="hidden" name={PROBLEM_FIELDS.eventId} value={eventId ?? ""} />
          {/* For scripts that fill every field. Out of sight and out of the tab order. */}
          <div aria-hidden="true" className="sr-only">
            <label>
              Website
              <input
                type="text"
                name={PROBLEM_FIELDS.trap}
                tabIndex={-1}
                autoComplete="off"
                defaultValue=""
              />
            </label>
          </div>
        </form>
      )}
      <p role="status" className={sent ? "text-ink-1" : "sr-only"}>
        {sent ? `Thanks, we got it. If we need more, we will reply to ${state.replyTo}.` : ""}
      </p>
    </Dialog>
  );
}
