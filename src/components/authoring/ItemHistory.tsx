"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { Button } from "@/components/ui/Button";
import { HISTORY_LIMIT, NO_CHANGES } from "@/lib/authoring/versionHistory";
import type { HistoryEntry } from "./historyEntries";

export type RestorableEntry = Extract<HistoryEntry, { ok: true }>;

export interface ItemHistoryProps {
  /** Published versions, newest first. */
  entries: readonly HistoryEntry[];
  /** More versions exist than are listed. */
  truncated: boolean;
  /** The versions could not be read, which is not the same as there being none. */
  loadFailed?: boolean;
  /** The editor has unsaved changes, which restoring would replace. */
  dirty: boolean;
  /** A save or publish is in flight; restoring now would hide how it ended. */
  busy?: boolean;
  /** Loads a version into the editor as unsaved changes. Never writes anything. */
  onRestore: (entry: RestorableEntry) => void;
}

/**
 * An item's published versions: pick one to read it as a student would see it (read-only), see
 * what differs from the saved draft, and restore it into the editor. Snapshots carry the answer
 * key, so this panel only ever renders on the item's editor page.
 */
export function ItemHistory({
  entries,
  truncated,
  loadFailed = false,
  dirty,
  busy = false,
  onRestore,
}: ItemHistoryProps) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const entry = entries.find((candidate) => candidate.version === selected);

  // Cancelling the confirmation returns focus to the button that asked for it.
  const refocusRestore = useRef(false);
  useEffect(() => {
    if (!refocusRestore.current) return;
    refocusRestore.current = false;
    document.getElementById(`${ids}-restore`)?.focus();
  });

  function restore(target: RestorableEntry) {
    setConfirming(false);
    setOpen(false);
    onRestore(target);
  }

  return (
    <section aria-labelledby={`${ids}-toggle`} className="mb-6 border-b border-line pb-4">
      <Button
        id={`${ids}-toggle`}
        size="sm"
        variant="ghost"
        aria-expanded={open}
        aria-controls={`${ids}-panel`}
        onClick={() => setOpen((current) => !current)}
      >
        History
      </Button>

      {open ? (
        <div id={`${ids}-panel`} className="mt-3 flex flex-col gap-4">
          {loadFailed ? (
            <p className="text-sm text-ink-2">
              The history could not be loaded. Reload the page to try again.
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-ink-2">
              Nothing published yet. Each publish adds a version here.
            </p>
          ) : (
            <>
              <ul aria-label="Published versions" className="flex flex-wrap gap-2">
                {entries.map((candidate) => (
                  <li key={candidate.version}>
                    <button
                      type="button"
                      aria-pressed={candidate.version === selected}
                      onClick={() => {
                        setSelected(candidate.version);
                        setConfirming(false);
                      }}
                      className="tap-target flex flex-col items-start rounded-sm border border-line bg-surface-1 px-3 py-2 text-left hover:border-line-strong aria-pressed:border-accent aria-pressed:bg-accent-soft"
                    >
                      <span className="text-sm font-medium text-ink-1">
                        Version {candidate.version}
                      </span>{" "}
                      <span className="text-xs text-ink-2">{candidate.published}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {truncated ? (
                <p className="text-sm text-ink-2">Showing the latest {HISTORY_LIMIT} versions.</p>
              ) : null}
            </>
          )}

          {entry ? (
            <section
              aria-labelledby={`${ids}-version`}
              className="flex flex-col gap-4 rounded-sm border border-line bg-surface-1 p-4"
            >
              <h2 id={`${ids}-version`} className="text-sm font-medium text-ink-1">
                Version {entry.version}
              </h2>

              <div>
                <p id={`${ids}-changes`} className="text-sm text-ink-2">
                  Compared with the saved draft
                </p>
                {entry.changes.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-1">{NO_CHANGES}</p>
                ) : (
                  <ul
                    aria-labelledby={`${ids}-changes`}
                    className="mt-1 flex list-disc flex-col gap-1 pl-5 text-sm text-ink-1"
                  >
                    {entry.changes.map((change) => (
                      <li key={change}>{change}</li>
                    ))}
                  </ul>
                )}
              </div>

              {entry.ok ? (
                <>
                  <section
                    aria-label={`Version ${entry.version} preview`}
                    className="min-w-0 rounded-sm border border-line bg-surface-0 p-4"
                  >
                    {/* Review mode: the question as a student reads it, with nothing to answer. */}
                    <ItemPlayer key={entry.version} item={entry.item} initialMode="review" />
                  </section>

                  {confirming ? (
                    <div className="flex flex-col gap-3">
                      <p className="text-sm text-ink-1">
                        Your unsaved changes will be replaced by version {entry.version}.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          aria-disabled={busy}
                          onClick={() => {
                            if (!busy) restore(entry);
                          }}
                        >
                          Replace my changes
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            refocusRestore.current = true;
                            setConfirming(false);
                          }}
                        >
                          Keep editing
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Button
                        id={`${ids}-restore`}
                        size="sm"
                        aria-disabled={busy}
                        aria-describedby={busy ? `${ids}-busy` : undefined}
                        onClick={() => {
                          if (busy) return;
                          if (dirty) setConfirming(true);
                          else restore(entry);
                        }}
                      >
                        Restore as draft
                      </Button>
                      {busy ? (
                        <p id={`${ids}-busy`} className="mt-2 text-sm text-ink-2">
                          Wait for the save to finish, then restore.
                        </p>
                      ) : null}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink-1">{entry.reason}</p>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
