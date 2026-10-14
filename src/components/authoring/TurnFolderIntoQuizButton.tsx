"use client";

import { useId, useRef, useState } from "react";
import type { ConfirmOutcome } from "@/components/classes/ConfirmSubmit";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { StaysBehindList } from "./StaysBehindList";

export interface TurnFolderIntoQuizButtonProps {
  /** `turnFolderIntoQuizAction`, bound to the quiz and the folder. Opens the new quiz on success. */
  action: () => Promise<ConfirmOutcome | void>;
  folderName: string;
  /** The name the new quiz will have: the folder's, numbered if a quiz already has it. */
  quizName: string;
  /** Whether the folder has folders inside it, whose content goes too. */
  hasSubfolders: boolean;
  /** What stays with this quiz when questions leave it. */
  staysBehind: readonly string[];
}

const UNEXPECTED = "That did not work. Try again.";

function isFrameworkSignal(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error;
}

/**
 * "Turn into a quiz", for the open in-quiz folder (#417). Pressing it changes nothing: a dialog
 * says what will happen and what stays with this quiz, and its own button is the one that acts.
 * A refusal keeps the dialog open with the reason; success opens the new quiz.
 */
export function TurnFolderIntoQuizButton({
  action,
  folderName,
  quizName,
  hasSubfolders,
  staysBehind,
}: TurnFolderIntoQuizButtonProps) {
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
      // The redirect to the new quiz is Next's signal, and must reach the router.
      if (isFrameworkSignal(error)) throw error;
      fail(UNEXPECTED);
      return;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    if (outcome && !outcome.ok) fail(outcome.message);
  }

  const inside = hasSubfolders ? " and the folders inside it" : "";
  return (
    <>
      <div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Turn into a quiz
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={close}
        title={`Turn "${folderName}" into a quiz?`}
        description={`A new quiz, "${quizName}", goes beside this one in the library with everything in this folder${inside}. The new quiz has no folders inside it.`}
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
              {busy ? "Turning…" : "Turn into a quiz"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <StaysBehindList lines={staysBehind} />
          {/* Always rendered: a region that appears with its text already in it is often not read. */}
          <p id={messageId} aria-live="polite" className="text-sm text-incorrect">
            {message ? <span key={failures}>{message}</span> : null}
          </p>
        </div>
      </Dialog>
    </>
  );
}
