"use client";

import { chartRows } from "@/components/live/stage/stageItem";
import { Button } from "@/components/ui/Button";
import { ResultsChart } from "@/components/ui/ResultsChart";
import type { Distribution } from "@/lib/live/results";
import { DistributionView } from "./DistributionView";
import { Footnotes, blankLine } from "./parts";
import { useHiddenResults } from "./useHiddenResults";
import { useRoomResults } from "./useRoomResults";

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

/**
 * The results panel on the host console (#180): the item the room is on, drawn per item type.
 *
 * Asked for, on the same cadence as the answer count and for the same reason — ADR 0002 sends
 * nothing while an item is answered, so the console pulls. It asks again when the room moves or
 * the answer is shown, so a reveal marks the correct choices at once. A failed ask is not
 * repeated until the next tick and says nothing: a panel that stops moving for three seconds is
 * not worth an error on a projector. A poll that brings the same results keeps the held object,
 * so the panel does not re-render (#318). While the browser tab is hidden it asks nothing, and it
 * asks at once when the tab comes back (#323).
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
  const current = useRoomResults(ask, position, revealed, active, intervalMs);
  const [hidden, setHidden] = useHiddenResults(sessionId);

  if (!active) return null;

  return (
    <section aria-labelledby="results-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="results-heading" className="text-base font-semibold text-ink-1">
          Results
        </h2>
        <Button size="sm" aria-controls="results-body" onClick={() => setHidden(!hidden)}>
          {hidden ? "Show results" : "Hide results"}
        </Button>
      </div>
      <div id="results-body">
        {hidden ? (
          <p className="text-base text-ink-2">Results are hidden.</p>
        ) : current === null ? (
          <p className="text-base text-ink-2">No answers yet.</p>
        ) : (
          <RoomResults distribution={current} revealed={revealed} />
        )}
      </div>
      {revealed || hidden ? null : (
        <p className="text-sm text-ink-2">
          Only you see these counts. The projector shows them when you show the answer.
        </p>
      )}
    </section>
  );
}

/**
 * One bar per option on the shared chart (PLAN §4: one neutral hue, the letter and the count on
 * every bar, the key marked three ways once shown). Every other kind keeps its own view.
 */
function RoomResults({
  distribution,
  revealed,
}: {
  distribution: Distribution;
  revealed: boolean;
}) {
  const rows = chartRows(distribution, revealed);
  if (rows === null || distribution.kind !== "options") {
    return <DistributionView distribution={distribution} revealed={revealed} />;
  }
  return (
    <div data-testid="results-view" data-kind="options">
      <p className="tabular mb-4 text-sm text-ink-2">
        {distribution.responded} {distribution.responded === 1 ? "answer" : "answers"} counted
      </p>
      <ResultsChart rows={rows} total={distribution.responded} label="Options" />
      <Footnotes
        lines={[
          blankLine(distribution.unanswered, "chose no option"),
          blankLine(distribution.unreadable, "could not be read and are not counted"),
        ]}
      />
    </div>
  );
}
