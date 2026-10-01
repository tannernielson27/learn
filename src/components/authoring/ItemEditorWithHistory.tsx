"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { HistoryEntry } from "./historyEntries";
import { ItemEditorHostContext, type ItemEditorHost } from "./ItemEditorHost";
import { ItemEditorLoader, type ItemEditorLoaderProps } from "./ItemEditorLoader";
import { ItemHistory, type RestorableEntry } from "./ItemHistory";
import { useLeaveGuard, type LeaveGuard } from "./LeaveGuard";

export interface ItemEditorWithHistoryProps {
  /** The editor opened on the saved draft. */
  editor: ItemEditorLoaderProps;
  /** Published versions, newest first. */
  entries: readonly HistoryEntry[];
  truncated: boolean;
  /** The versions could not be read. */
  loadFailed?: boolean;
  /** The item is published as the page opened, so saving a draft would unpublish it. */
  published?: boolean;
}

/** Where to go once the author has agreed to discard unsaved changes. */
type Leaving = { href: string; go?: () => void };

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
  published: openedPublished = false,
}: ItemEditorWithHistoryProps) {
  const router = useRouter();
  const askId = useId();
  const [dirty, setDirty] = useState(false);
  const [published, setPublished] = useState(openedPublished);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
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
      published,
      onPublishedChange: setPublished,
      ...(restored ? { savedValues: savedDraft } : {}),
    }),
    [restored, savedDraft, published],
  );

  // Every way off the page by link or Duplicate asks first while there are unsaved changes; the
  // browser's own beforeunload covers reloads and closing the tab (EditorShell).
  const guardLeave = useCallback<LeaveGuard>(
    (href, go) => {
      if (!dirty) return false;
      setLeaving({ href, go });
      return true;
    },
    [dirty],
  );
  useLeaveGuard(guardLeave);

  // The question can open far from where the author clicked, so it takes focus to be seen.
  const ask = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (leaving) ask.current?.focus();
  }, [leaving]);

  function discardAndLeave() {
    if (!leaving) return;
    setLeaving(null);
    if (leaving.go) leaving.go();
    else router.push(leaving.href);
  }

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
      {leaving ? (
        <div
          ref={ask}
          role="alertdialog"
          aria-labelledby={askId}
          tabIndex={-1}
          className="mb-4 flex flex-col gap-3 rounded-sm border border-line bg-surface-1 p-4"
        >
          <p id={askId} className="text-sm font-medium text-ink-1">
            This item has unsaved changes
          </p>
          <p className="text-sm text-ink-2">
            Stay to save them, or discard them and leave this item.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={discardAndLeave}>
              Discard changes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLeaving(null)}>
              Stay on this item
            </Button>
          </div>
        </div>
      ) : null}
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
