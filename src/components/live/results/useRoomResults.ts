"use client";

import { useEffect, useState } from "react";
import { pollWhileVisible } from "@/components/live/pollWhileVisible";
import { keepSame } from "@/components/live/sameData";
import type { Distribution } from "@/lib/live/results";

interface Held {
  position: number | null;
  distribution: Distribution | null;
}

/**
 * How the room answered the item it is on (#180), asked for on the tally's cadence while `active`.
 *
 * A pull, for the reason the tally is one: ADR 0002 sends nothing while an item is answered. It
 * asks again when the room moves or the answer is shown, so a reveal marks the key at once. A
 * failed ask is not repeated until the next tick and says nothing. A poll that brings the same
 * results keeps the held object, so nothing re-renders (#318); a hidden tab asks nothing (#323).
 * Results about an item the room has left are dropped rather than drawn under the next one.
 *
 * The console's results panel and the projector's reveal both read this.
 */
export function useRoomResults(
  ask: () => Promise<Distribution | null>,
  position: number | null,
  revealed: boolean,
  active: boolean,
  intervalMs: number,
): Distribution | null {
  const [held, setHeld] = useState<Held | null>(null);

  useEffect(() => {
    if (!active) return;
    let watching = true;
    const askNow = () => {
      void ask()
        .then((distribution) => {
          if (watching) setHeld(keepSame<Held>({ position, distribution }));
        })
        .catch(() => {});
    };
    const stop = pollWhileVisible(askNow, intervalMs);
    return () => {
      watching = false;
      stop();
    };
  }, [active, ask, position, revealed, intervalMs]);

  return active && held !== null && held.position === position ? held.distribution : null;
}
