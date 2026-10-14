"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export interface CopyTextButtonProps {
  /** Exactly what lands on the clipboard. */
  text: string;
  /** The button's label, which is also its accessible name. */
  label: string;
  /** Said when the clipboard refuses: where on the page to copy it from by hand. */
  failedMessage: string;
}

type CopyState = "idle" | "copied" | "failed";

/** Copies one piece of text. The text is also on the page, so a refused clipboard costs nothing. */
export function CopyTextButton({ text, label, failedMessage }: CopyTextButtonProps) {
  const [state, setState] = useState<CopyState>("idle");

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  const message = state === "copied" ? "Copied." : state === "failed" ? failedMessage : "";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={copy}>{label}</Button>
      <p role="status" className="text-sm text-ink-2">
        {message}
      </p>
    </div>
  );
}

export interface CopyLinkButtonProps {
  url: string;
}

/** Copies the invite link. The link is also shown in a box. */
export function CopyLinkButton({ url }: CopyLinkButtonProps) {
  return (
    <CopyTextButton
      text={url}
      label="Copy invite link"
      failedMessage="Could not copy. Select the link and copy it from the box instead."
    />
  );
}
