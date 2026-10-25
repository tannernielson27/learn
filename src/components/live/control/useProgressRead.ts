"use client";

import { useEffect, useState } from "react";
import { pollWhileVisible } from "@/components/live/pollWhileVisible";
import { keepSame } from "@/components/live/sameData";
import type { SessionProgress } from "@/lib/live";

/** A progress read, and the position it was taken for. */
export interface ProgressRead {
  position: number;
  progress: SessionProgress | null;
}

/**
 * Who has answered what, asked for on the tally's cadence while answers are coming in (`active`):
 * the progress read the student-paced board makes, which says answered or not and nothing more.
 * Two indexed reads per tick on the teacher's own connection, no Realtime message (ADR 0002), and
 * none at all in the lobby, after the answer is shown, or on a hidden tab.
 *
 * Null until a read taken on *this visit* to the question is back. Leaving the question, or
 * pausing, forgets the read, so coming back to a question never shows the read from an earlier
 * visit: the not-answered list and the early end of the timer both wait for a fresh one.
 */
export function useProgressRead(
  ask: () => Promise<SessionProgress | null>,
  position: number | null,
  active: boolean,
  intervalMs: number,
): ProgressRead | null {
  const [held, setHeld] = useState<ProgressRead | null>(null);
  const visit = active ? position : null;
  const [onVisit, setOnVisit] = useState(visit);
  if (onVisit !== visit) {
    setOnVisit(visit);
    setHeld(null);
  }

  useEffect(() => {
    if (!active || position === null) return;
    let watching = true;
    const askNow = () => {
      void ask()
        .then((progress) => {
          if (watching) setHeld(keepSame<ProgressRead>({ position, progress }));
        })
        .catch(() => {});
    };
    const stop = pollWhileVisible(askNow, intervalMs);
    return () => {
      watching = false;
      stop();
    };
  }, [active, ask, position, intervalMs]);

  if (visit === null || held === null || held.position !== visit) return null;
  return held;
}
