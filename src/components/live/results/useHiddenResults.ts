"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether the host has hidden the results on this session's console (#180), remembered across a
 * reload in this browser. A convenience and nothing more: storage that is blocked, full or cleared
 * falls back to this page's memory, and the default is always "showing".
 */
const PREFIX = "learn.hostResults.hidden.";

const listeners = new Set<() => void>();
/** What this page has chosen, for when the browser will not keep it. */
const remembered = new Map<string, boolean>();

function read(sessionId: string): boolean {
  try {
    const stored = window.localStorage.getItem(PREFIX + sessionId);
    if (stored !== null) return stored === "1";
  } catch {
    // Blocked storage: fall through to what this page remembers.
  }
  return remembered.get(sessionId) ?? false;
}

function write(sessionId: string, hidden: boolean): void {
  remembered.set(sessionId, hidden);
  try {
    window.localStorage.setItem(PREFIX + sessionId, hidden ? "1" : "0");
  } catch {
    // Remembered in memory above; nothing else to do.
  }
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useHiddenResults(sessionId: string): [boolean, (hidden: boolean) => void] {
  const hidden = useSyncExternalStore(
    subscribe,
    () => read(sessionId),
    // The server cannot know, and the results are not there to hide before the page hydrates.
    () => false,
  );
  const setHidden = useCallback((next: boolean) => write(sessionId, next), [sessionId]);
  return [hidden, setHidden];
}
