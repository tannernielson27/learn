"use client";

import { useEffect, useState } from "react";
import { pollWhileVisible } from "@/components/live/pollWhileVisible";
import { keepSame } from "@/components/live/sameData";
import type { RosterEntry, SessionProgress } from "@/lib/live";
import { notAnswered } from "./notAnswered";

interface Held {
  position: number;
  progress: SessionProgress | null;
}

/**
 * Who has not answered the question on now, asked for on the tally's cadence while answers are
 * coming in (`active`): the progress read the student-paced board makes, which says answered or
 * not and nothing more. Two indexed reads per tick on the teacher's own connection, no Realtime
 * message (ADR 0002), and none at all in the lobby, after the answer is shown, or on a hidden tab.
 */
export function useNotAnswered(
  ask: () => Promise<SessionProgress | null>,
  roster: readonly RosterEntry[],
  position: number | null,
  active: boolean,
  intervalMs: number,
): RosterEntry[] | null {
  const [held, setHeld] = useState<Held | null>(null);

  useEffect(() => {
    if (!active || position === null) return;
    let watching = true;
    const askNow = () => {
      void ask()
        .then((progress) => {
          if (watching) setHeld(keepSame<Held>({ position, progress }));
        })
        .catch(() => {});
    };
    const stop = pollWhileVisible(askNow, intervalMs);
    return () => {
      watching = false;
      stop();
    };
  }, [active, ask, position, intervalMs]);

  if (!active || held === null || held.position !== position) return null;
  return notAnswered(roster, held.progress, position);
}
