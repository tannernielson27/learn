"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Distribution } from "@/lib/live/results";
import { DistributionView } from "./DistributionView";
import { useHiddenResults } from "./useHiddenResults";

export interface HostResultsProps {
  sessionId: string;
  /** Asks the console's transport how the room answered the item it is on (`results()`). */
  ask: () => Promise<Distribution | null>;
  /** The item the room is on, so results about the one it has just left are not drawn. */
  position: number | null;
  /** Whether the host has shown the answer. Until then nothing is marked correct. */
  revealed: boolean;
  /** Whether the room is on an item at all. A lobby and an ended session ask for nothing. */
  active: boolean;
  /** The tally's cadence (`TALLY_INTERVAL_MS`). */
  intervalMs: number;
}

interface Held {
  position: number | null;
  distribution: Distribution | null;
}

/**
 * The results panel on the host console (#180): the item the room is on, drawn per item type.
 *
 * Asked for, on the same cadence as the answer count and for the same reason — ADR 0002 sends
 * nothing while an item is answered, so the console pulls. It asks again when the room moves or
 * the answer is shown, so a reveal marks the correct choices at once. A failed ask is not
 * repeated until the next tick and says nothing: a panel that stops moving for three seconds is
 * not worth an error on a projector.
 *
 * "Hide results" is for projecting the question without the tallies. It is remembered for this
 * session in this browser, and asking carries on while hidden so showing them again is instant.
 */
export function HostResults({
  sessionId,
  ask,
  position,
  revealed,
  active,
  intervalMs,
}: HostResultsProps) {
  const [held, setHeld] = useState<Held | null>(null);
  const [hidden, setHidden] = useHiddenResults(sessionId);

  useEffect(() => {
    if (!active) return;
    let watching = true;
    const askNow = () => {
      void ask()
        .then((distribution) => {
          if (watching) setHeld({ position, distribution });
        })
        .catch(() => {});
    };
    askNow();
    const timer = setInterval(askNow, intervalMs);
    return () => {
      watching = false;
      clearInterval(timer);
    };
  }, [active, ask, position, revealed, intervalMs]);

  if (!active) return null;
  const current = held !== null && held.position === position ? held.distribution : null;

  return (
    <section aria-labelledby="results-heading" className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="results-heading" className="font-read text-xl text-ink-1">
          Results
        </h2>
        <Button size="sm" aria-controls="results-body" onClick={() => setHidden(!hidden)}>
          {hidden ? "Show results" : "Hide results"}
        </Button>
      </div>
      <div
        id="results-body"
        className="mt-4 rounded-sm border border-line bg-surface-1 px-4 py-5 sm:px-6"
      >
        {hidden ? (
          <p className="text-base text-ink-2">
            Results are hidden. The answer count above still updates.
          </p>
        ) : current === null ? (
          <p className="text-base text-ink-2">Results appear here as answers come in.</p>
        ) : (
          <DistributionView distribution={current} revealed={revealed} />
        )}
      </div>
    </section>
  );
}
