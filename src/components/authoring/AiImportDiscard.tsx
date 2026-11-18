"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import type { AiImportFailure } from "@/lib/authoring/aiImportUpload";
import { FieldError } from "./FieldError";

/** What the page says when a request failed in a way no code explains. */
export const UNEXPECTED = "That did not work. Try again.";

export interface AiImportDiscardProps {
  batchId: string;
  bankId: string;
  /** The batch, its staged questions and its uploaded files deleted (#348). */
  discard: (input: { batchId: string }) => Promise<{ ok: true } | AiImportFailure>;
  /** The dialog's way out, named for the screen it is on. */
  keepLabel?: string;
}

/**
 * "Discard this import" (#348), on the review screen and, since #591, on the upload page at every
 * stage. Pressing it changes nothing: a dialog says what goes, and its own button is the one that
 * acts. Success goes back to the quiz; a refusal keeps the dialog open.
 */
export function AiImportDiscard({
  batchId,
  bankId,
  discard,
  keepLabel = "Keep reviewing",
}: AiImportDiscardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const messageId = useId();

  const close = () => {
    if (inFlight.current) return;
    setMessage(null);
    setOpen(false);
  };

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await discard({ batchId });
      if (result.ok) {
        router.push(`/author/banks/${bankId}`);
        return;
      }
      setMessage(result.message);
    } catch {
      setMessage(UNEXPECTED);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Discard this import
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={close}
        title="Discard this import?"
        description="Every question found in these files is deleted, and so are the uploaded files."
        actions={
          <>
            <Button variant="ghost" onClick={close}>
              {keepLabel}
            </Button>
            {/* aria-disabled, not disabled: a disabled button drops focus mid-request. */}
            <Button
              variant="primary"
              aria-disabled={busy || undefined}
              aria-describedby={message ? messageId : undefined}
              onClick={confirm}
            >
              {busy ? "Discarding…" : "Discard"}
            </Button>
          </>
        }
      >
        {/* Always rendered: a region that appears with its text already in it is often not read. */}
        <div id={messageId} aria-live="polite">
          {message ? <FieldError>{message}</FieldError> : null}
        </div>
      </Dialog>
    </>
  );
}
