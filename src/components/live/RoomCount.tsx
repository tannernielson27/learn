"use client";

import { useSyncExternalStore } from "react";

/** How many phones are in the room, held outside React so that only `RoomCount` follows it. */
export interface PresentCount {
  read: () => number;
  /** Takes the size of the latest roster. A sync that leaves the number alone tells nobody. */
  set: (count: number) => void;
  subscribe: (listener: () => void) => () => void;
}

/**
 * The count a student's room keeps from Realtime Presence (#408).
 *
 * Every join and leave in a session reaches every phone as a presence sync. Held in the room's
 * own state, each one re-rendered the whole room — the item and the answer in progress included —
 * for a number that is only on the screen while there is nothing to answer. Held here, a sync
 * costs the room nothing: the one line that shows the number subscribes to it, and it is mounted
 * only on the waiting screen. The number is still kept while an item is up, so it is right the
 * moment the room pauses.
 *
 * Starts at one: this phone is in the room before its first sync says so.
 */
export function createPresentCount(): PresentCount {
  let count = 1;
  const listeners = new Set<() => void>();
  return {
    read: () => count,
    set: (next) => {
      if (next === count) return;
      count = next;
      // Copied before dispatch: a listener that unsubscribes must not skip the one after it.
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** "12 in this session", on the waiting screen of both student rooms. */
export function RoomCount({ present }: { present: PresentCount }) {
  const count = useSyncExternalStore(present.subscribe, present.read, present.read);
  return (
    <p data-testid="room-count" className="tabular mt-8 text-sm text-ink-2">
      {/* Keyed on the number, so a join or a leave settles the number in and nothing else. */}
      <span
        key={count}
        data-motion="room-count"
        className="motion-settle inline-block motion-reduce:animate-none"
      >
        {count}
      </span>{" "}
      in this session
    </p>
  );
}
