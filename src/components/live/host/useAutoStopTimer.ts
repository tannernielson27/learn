"use client";

import { useEffect, useRef, useState } from "react";
import { stillToAnswer } from "@/components/live/control/notAnswered";
import type { ProgressRead } from "@/components/live/control/useProgressRead";
import { AUTO_STOP_IDLE, stepAutoStop, type AutoStopMemory } from "@/lib/live/autoStop";
import type { HostRoom } from "./useHostRoom";

export type AutoStopRoom = Pick<
  HostRoom,
  "state" | "roster" | "serverNow" | "stopQuietly" | "revealQuietly"
>;

/**
 * Ends the timer once everyone has answered (`src/lib/live/autoStop.ts` holds the rule). Mounted
 * by the control view only, so a projector window — which has no controls — never sends it; two
 * control windows may both send it, and the second is refused `no_timer`, which `stopQuietly`
 * takes as done.
 *
 * Who has answered is per person, from `read`: the progress read the not-answered list is built
 * from, taken on this visit to the question (`useProgressRead`). Never the tally's count against
 * the phones connected now.
 *
 * Returns the position this console ended and revealed, for the quiet status line, or null.
 */
export function useAutoStopTimer(room: AutoStopRoom, read: ProgressRead | null): number | null {
  const { state, roster, serverNow, stopQuietly, revealQuietly } = room;
  const memory = useRef<AutoStopMemory>(AUTO_STOP_IDLE);
  const [ended, setEnded] = useState<number | null>(null);
  // Leaving the question forgets it, so coming back to it later shows no stale line.
  const [onPosition, setOnPosition] = useState(state.position);
  if (onPosition !== state.position) {
    setOnPosition(state.position);
    setEnded(null);
  }
  const position = read?.position ?? null;
  const waiting = read === null ? null : stillToAnswer(roster, read.progress, read.position);
  const people = roster.length;

  useEffect(() => {
    let handle: ReturnType<typeof setTimeout> | undefined;
    const look = () => {
      const step = stepAutoStop(
        memory.current,
        { state, watch: { position, roster: people, waiting }, enabled: true },
        serverNow(),
      );
      memory.current = step.memory;
      if (step.fire) {
        const at = state.position;
        // Stop first, then reveal: the stop is what the rule has always sent, and a reveal on its
        // own would leave the clock to the database trigger alone.
        void stopQuietly()
          .then((stopped) => (stopped ? revealQuietly() : false))
          .then((revealed) => {
            if (revealed) setEnded(at);
          });
      } else if (step.waitMs !== null) {
        handle = setTimeout(look, step.waitMs);
      }
    };
    look();
    return () => clearTimeout(handle);
  }, [state, position, waiting, people, serverNow, stopQuietly, revealQuietly]);

  return ended === state.position ? ended : null;
}
