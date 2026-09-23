"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export interface CopyLinkButtonProps {
  url: string;
}

type CopyState = "idle" | "copied" | "failed";

const MESSAGES: Record<CopyState, string> = {
  idle: "",
  copied: "Copied.",
  failed: "Could not copy. Select the link and copy it from the box instead.",
};

/** Copies the invite link. The link is also shown in a box, so a refused clipboard costs nothing. */
export function CopyLinkButton({ url }: CopyLinkButtonProps) {
  const [state, setState] = useState<CopyState>("idle");

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={copy}>Copy invite link</Button>
      <p role="status" className="text-sm text-ink-2">
        {MESSAGES[state]}
      </p>
    </div>
  );
}
