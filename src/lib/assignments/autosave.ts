/**
 * Autosave for an attempt (#208): every change is saved to the server, debounced, last write wins.
 *
 * One queue for the whole attempt, holding the newest unsent answer per item. A change replaces
 * whatever was waiting for that item, so a burst of taps becomes one save. Saves go out one at a
 * time, oldest item first, which keeps a newer answer from ever overtaking an older one for the
 * same item on the wire: the server's "last write wins" is then the student's last change.
 *
 * A save that fails is put back (unless a newer answer for that item is already waiting) and the
 * queue is tried again after a growing pause; the status says "retrying" until it goes through. A
 * refusal no retry can fix (the assignment closed, the attempt was submitted elsewhere, the student
 * was signed out) stops the queue and says why, and the page is read again.
 *
 * No React, so it can be tested with fake timers; `useAutosave` in the player wraps it.
 */
import type { AttemptRefusal } from "./attemptRefusals";

export type SaveResult = { ok: true } | { ok: false; refusal: AttemptRefusal; final: boolean };

/** idle: nothing changed yet. saving: a change is waiting or on its way. */
export type SaveStatus = "idle" | "saving" | "saved" | "retrying" | "stopped";

export interface Timers {
  set: (callback: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface AutosaveOptions<R> {
  save: (itemId: string, response: R) => Promise<SaveResult>;
  onStatus: (status: SaveStatus, refusal?: AttemptRefusal) => void;
  /** How long a change waits for the next one before it is sent. */
  debounceMs?: number;
  /** The pauses between retries; the last one repeats. */
  retryMs?: readonly number[];
  timers?: Timers;
}

export interface Autosaver<R> {
  /** A new answer for an item. */
  change(itemId: string, response: R): void;
  /** Sends everything waiting now. True when nothing is left unsaved. */
  flush(): Promise<boolean>;
  /** Whether anything has not reached the server yet. */
  hasUnsaved(): boolean;
  /** Stops every timer; nothing more is sent. */
  dispose(): void;
}

const DEFAULT_TIMERS: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createAutosaver<R>({
  save,
  onStatus,
  debounceMs = 800,
  retryMs = [2000, 5000, 10000],
  timers = DEFAULT_TIMERS,
}: AutosaveOptions<R>): Autosaver<R> {
  const queue = new Map<string, R>();
  let timer: unknown = null;
  let draining: Promise<boolean> | null = null;
  let failures = 0;
  let stopped = false;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  const schedule = (ms: number) => {
    clearTimer();
    timer = timers.set(() => {
      timer = null;
      void drain();
    }, ms);
  };

  /** Sends the oldest waiting answer. False when it did not go through. */
  const sendNext = async (): Promise<boolean> => {
    const next = queue.entries().next();
    if (next.done) return true;
    const [itemId, response] = next.value;
    queue.delete(itemId);
    let result: SaveResult;
    try {
      result = await save(itemId, response);
    } catch {
      result = { ok: false, refusal: "failed", final: false };
    }
    if (result.ok) return true;
    if (result.final) {
      stopped = true;
      queue.clear();
      clearTimer();
      onStatus("stopped", result.refusal);
      return false;
    }
    // Put it back, unless the student has changed that item again since.
    if (!queue.has(itemId)) queue.set(itemId, response);
    failures += 1;
    onStatus("retrying", result.refusal);
    if (!disposed) schedule(retryMs[Math.min(failures - 1, retryMs.length - 1)] ?? 10000);
    return false;
  };

  const drain = (): Promise<boolean> => {
    if (draining) return draining;
    draining = (async () => {
      while (queue.size > 0 && !stopped && !disposed) {
        if (!(await sendNext())) return false;
      }
      if (!stopped && queue.size === 0) {
        failures = 0;
        onStatus("saved");
      }
      return queue.size === 0 && !stopped;
    })().finally(() => {
      draining = null;
    });
    return draining;
  };

  return {
    change(itemId, response) {
      if (stopped || disposed) return;
      queue.set(itemId, response);
      onStatus(failures > 0 ? "retrying" : "saving");
      // While a retry is waiting, a new change does not jump it: the retry pause stands.
      if (failures === 0) schedule(debounceMs);
    },
    async flush() {
      if (stopped) return false;
      clearTimer();
      if (draining) await draining;
      if (queue.size === 0) return !stopped;
      return drain();
    },
    hasUnsaved: () => queue.size > 0 || draining !== null,
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
