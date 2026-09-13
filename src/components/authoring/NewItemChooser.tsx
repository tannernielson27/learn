"use client";

import { useRef, useState, useTransition } from "react";
import type { ItemType } from "@/lib/ngn/labels";
import { NewItemPicker } from "./NewItemPicker";

export interface NewItemChooserProps {
  /** Creates a draft and navigates to its editor; resolves with an error only when that fails. */
  create: (type: ItemType) => Promise<{ error: string }>;
}

export function NewItemChooser({ create }: NewItemChooserProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // A ref, not state: a second tap in the same frame must not start a second draft.
  const busy = useRef(false);

  function choose(type: ItemType) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const result = await create(type);
        if (result?.error) setError(result.error);
      } finally {
        busy.current = false;
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? (
        <p role="alert" className="text-sm text-incorrect">
          {error}
        </p>
      ) : null}
      <NewItemPicker onChoose={choose} busy={pending} />
    </div>
  );
}
