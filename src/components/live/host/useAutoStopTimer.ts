"use client";

import { useEffect, useRef, useState } from "react";
import { countPresent } from "@/lib/live";
import { AUTO_STOP_IDLE, stepAutoStop, type AutoStopMemory } from "@/lib/live/autoStop";
import type { HostRoom } from "./useHostRoom";

export type AutoStopRoom = Pick<
  HostRoom,
  "state" | "tally" | "roster" | "serverNow" | "stopQuietly"
>;

/**
 * Ends the timer once everyone in the room has answered (`src/lib/live/autoStop.ts` holds the
 * rule). Mounted by the control view only, so a projector window — which has no controls — never
 * sends it; two control windows may both send it, and the second is refused `no_timer`, which
 * `stopQuietly` takes as done.
 *
 * Returns the position whose timer this console ended, for the quiet status line, or null.
 */
export function useAutoStopTimer(room: AutoStopRoom, enabled: boolean): number | null {
  const { state, tally, roster, serverNow, stopQuietly } = room;
  const memory = useRef<AutoStopMemory>(AUTO_STOP_IDLE);
  const [ended, setEnded] = useState<number | null>(null);
  // Leaving the question forgets it, so coming back to it later shows no stale line.
  const [onPosition, setOnPosition] = useState(state.position);
  if (onPosition !== state.position) {
    setOnPosition(state.position);
    setEnded(null);
  }
  const present = countPresent(roster);
  const position = tally?.position ?? null;
  const answered = tally?.responded ?? null;

  useEffect(() => {
    let handle: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      const step = stepAutoStop(
        memory.current,
        { state, counts: { position, answered, present }, enabled },
        serverNow(),
      );
      memory.current = step.memory;
      if (step.fire) {
        const at = state.position;
        void stopQuietly().then((stopped) => {
          if (stopped) setEnded(at);
        });
      } else if (step.waitMs !== null) {
        handle = setTimeout(look, step.waitMs);
      }
    };
    look();
    return () => clearTimeout(handle);
  }, [state, position, answered, present, enabled, serverNow, stopQuietly]);

  return ended === state.position && !state.reveal ? ended : null;
}
