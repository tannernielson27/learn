"use client";

import { useId, useRef, useState } from "react";
import type { ConfirmOutcome } from "@/components/classes/ConfirmSubmit";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { removeWarning } from "@/lib/workspace/membership";

export interface RemoveMemberButtonProps {
  /** `removeMember`, already bound to the colleague it removes. */
  action: () => Promise<ConfirmOutcome | void>;
  /** The colleague as the list names them: their display name, or their address. Text only. */
  name: string;
  /**
   * The id of a focusable element to focus once the colleague is gone. Their row, and this
   * button with it, leaves the page, so focus would otherwise fall to the document body.
   */
  focusOnSuccess?: string;
}

/** For an action that threw rather than answering: nothing the person can act on but a retry. */
const UNEXPECTED = "That did not work. Try again.";

function isFrameworkSignal(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

/**
 * "Remove", for one colleague's row, shown to the workspace's founder only. Pressing it removes
 * nobody: it opens a dialog that says what removing does, and the dialog's own button is the one
 * that acts. Cancel, the close button and Escape all leave everything as it was.
 *
 * A failure keeps the dialog open with the reason in it, announced through a live region that is
 * on the page before anything fails. While the request is in flight a second press is dropped.
 */
export function RemoveMemberButton({ action, name, focusOnSuccess }: RemoveMemberButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState(0);
  const inFlight = useRef(false);
  const messageId = useId();

  function close() {
    if (inFlight.current) return;
    setMessage(null);
    setOpen(false);
  }

  function fail(text: string) {
    setMessage(text);
    setFailures((count) => count + 1);
  }

  async function confirm() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let outcome: ConfirmOutcome | void;
    try {
      outcome = await action();
    } catch (error) {
      // Next's redirect and not-found signals carry a digest and must reach the router.
      if (isFrameworkSignal(error)) throw error;
      fail(UNEXPECTED);
      return;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    if (outcome && !outcome.ok) {
      fail(outcome.message);
      return;
    }
    setMessage(null);
    setOpen(false);
    // After the dialog has let go of the page: the row that opened it is about to leave.
    if (focusOnSuccess) {
      requestAnimationFrame(() => document.getElementById(focusOnSuccess)?.focus());
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        aria-label={`Remove ${name} from the workspace`}
        onClick={() => setOpen(true)}
      >
        Remove
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={`Remove ${name}?`}
        description={removeWarning(name)}
        actions={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {/* aria-disabled, not disabled: a disabled button drops focus mid-request. */}
            <Button
              variant="primary"
              aria-disabled={busy || undefined}
              aria-describedby={message ? messageId : undefined}
              onClick={confirm}
            >
              {busy ? "Removing…" : "Remove from workspace"}
            </Button>
          </>
        }
      >
        {/* Always rendered: a region that appears with its text already in it is often not read. */}
        <p id={messageId} aria-live="polite" className="text-sm text-incorrect">
          {message ? <span key={failures}>{message}</span> : null}
        </p>
      </Dialog>
    </>
  );
}
