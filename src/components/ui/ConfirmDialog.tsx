"use client";

import type { ReactNode } from "react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  /** The question, as a question: "End this live session?" */
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** What the move is, in the caller's words: "End live session". Never just "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  /** Cancel, the close button and Escape all land here. */
  onCancel: () => void;
  /** While the move is in flight: both buttons hold still and the confirm says so to a reader. */
  busy?: boolean;
}

/**
 * "Are you sure?" on the one dialog primitive (PLAN D12), in place of the hand-built confirm
 * panels. The confirm button is the primary one and comes last; red is for marking answers, so a
 * destructive move says what it does in words instead.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      actions={
        <>
          <Button onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
