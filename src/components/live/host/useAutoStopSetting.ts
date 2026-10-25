"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether this device ends the timer once everyone has answered, remembered in this browser for
 * every live session. On unless the teacher turned it off: storage that is blocked, full or
 * cleared falls back to this page's memory, and then to on.
 */
const KEY = "learn.live.autoStopTimer";

const listeners = new Set<() => void>();
/** What this page has chosen, for when the browser will not keep it. */
let remembered: boolean | null = null;

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored !== null) return stored !== "0";
  } catch {
    // Blocked storage: fall through to what this page remembers.
  }
  return remembered ?? true;
}

function write(on: boolean): void {
  remembered = on;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
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

export function useAutoStopSetting(): [boolean, (on: boolean) => void] {
  // The server renders the default; the browser's own choice follows on hydration.
  const on = useSyncExternalStore(subscribe, read, () => true);
  return [on, write];
}
