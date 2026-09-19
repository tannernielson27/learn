"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { HistoryEntry } from "./historyEntries";
import { ItemEditorHostContext, type ItemEditorHost } from "./ItemEditorHost";
import { ItemEditorLoader, type ItemEditorLoaderProps } from "./ItemEditorLoader";
import { ItemHistory, type RestorableEntry } from "./ItemHistory";

export interface ItemEditorWithHistoryProps {
  /** The editor opened on the saved draft. */
  editor: ItemEditorLoaderProps;
  /** Published versions, newest first. */
  entries: readonly HistoryEntry[];
  truncated: boolean;
  /** The versions could not be read. */
  loadFailed?: boolean;
}

interface Restored {
  version: number;
  editor: ItemEditorLoaderProps;
}

/**
 * A standalone item's editor with its History panel above it. Restoring a version reopens the
 * editor on that version as unsaved changes: nothing is written until the author saves or
 * publishes, and publishing appends a new version, so history is never rewritten.
 */
export function ItemEditorWithHistory({
  editor,
  entries,
  truncated,
  loadFailed = false,
}: ItemEditorWithHistoryProps) {
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState<Restored | null>(null);
  // Each restore mounts a fresh editor, even when the same version is restored twice.
  const [restoreCount, setRestoreCount] = useState(0);

  // The saved draft is only read when a restored editor mounts, so later refreshes of it are fine.
  const savedDraft = editor.initialValues;
  const host = useMemo<ItemEditorHost>(
    () => ({
      inCaseStudy: false,
      onDirtyChange: setDirty,
      onBusyChange: setBusy,
      ...(restored ? { savedValues: savedDraft } : {}),
    }),
    [restored, savedDraft],
  );

  const status = useRef<HTMLParagraphElement>(null);
  const focusStatus = useRef(false);
  useEffect(() => {
    if (!focusStatus.current) return;
    focusStatus.current = false;
    status.current?.focus();
  });

  function restore(entry: RestorableEntry) {
    focusStatus.current = true;
    setRestored({ version: entry.version, editor: entry.restore });
    setRestoreCount((count) => count + 1);
  }

  return (
    <>
      <ItemHistory
        entries={entries}
        truncated={truncated}
        loadFailed={loadFailed}
        dirty={dirty}
        busy={busy}
        onRestore={restore}
      />
      {restored ? (
        <p ref={status} role="status" tabIndex={-1} className="mb-4 text-sm text-ink-1">
          {/* Once saved (or if it was never different), the version simply is the draft. */}
          {dirty
            ? `Version ${restored.version} is loaded as unsaved changes. Save draft or publish to keep it; publishing adds a new version.`
            : `Version ${restored.version} matches the saved draft.`}
        </p>
      ) : null}
      <ItemEditorHostContext.Provider value={host}>
        <ItemEditorLoader key={restoreCount} {...(restored?.editor ?? editor)} />
      </ItemEditorHostContext.Provider>
    </>
  );
}
