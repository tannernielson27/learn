"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { RenameDialog } from "./ManagedSessionList";

/**
 * The report's Rename (#565), beside Download CSV, for the teacher who ran the session. Saving
 * refreshes the page from the server, so the new title replaces the heading.
 */
export function RenameSessionButton({ sessionId, title }: { sessionId: string; title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Rename</Button>
      <RenameDialog
        session={open ? { id: sessionId, title } : null}
        onClose={() => setOpen(false)}
        onSaved={() => setOpen(false)}
      />
    </>
  );
}
