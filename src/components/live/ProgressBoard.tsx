"use client";

import { useEffect, useState } from "react";
import type { SessionProgress } from "@/lib/live";

export interface ProgressBoardProps {
  /** Asks the console's transport who has answered what (`progress()`). */
  ask: () => Promise<SessionProgress | null>;
  /** How many items the set holds, so the columns are there before the first answer lands. */
  itemCount: number;
  /** Whether the room is running or paused. A lobby and an ended room ask for nothing. */
  active: boolean;
  /** The tally's cadence (`TALLY_INTERVAL_MS`). */
  intervalMs: number;
}

/**
 * The student-paced progress board on the host console (#185): everyone who has joined against
 * every item in the set, answered or not, with how many have answered each item beneath.
 *
 * **Answered, never right or wrong.** The transport's `progress()` carries no marks at all, so
 * nothing here could colour a cell by how well it went — and on a projector before "Show answers"
 * that would be a hint to the whole room. A filled cell means "has answered", said in words to a
 * screen reader and by a shape as well as a colour on the screen.
 *
 * **Asked for, not pushed.** On the tally's three-second cadence, for ADR 0002's reason: nothing
 * goes over Realtime while a class answers. A failed ask says nothing and is tried on the next
 * tick, as the results panel does.
 *
 * At 375px the grid scrolls sideways inside its own region, which is focusable so a keyboard can
 * scroll it too; the page itself never scrolls sideways.
 */
export function ProgressBoard({ ask, itemCount, active, intervalMs }: ProgressBoardProps) {
  const [progress, setProgress] = useState<SessionProgress | null>(null);

  useEffect(() => {
    if (!active) return;
    let watching = true;
    const askNow = () => {
      void ask()
        .then((next) => {
          if (watching && next !== null) setProgress(next);
        })
        .catch(() => {});
    };
    askNow();
    const timer = setInterval(askNow, intervalMs);
    return () => {
      watching = false;
      clearInterval(timer);
    };
  }, [active, ask, intervalMs]);

  if (!active) return null;
  const positions = Array.from({ length: itemCount }, (_, index) => index + 1);
  const rows = progress?.rows ?? [];

  return (
    <section aria-labelledby="progress-heading" className="mt-8">
      <h2 id="progress-heading" className="font-read text-xl text-ink-1">
        Progress
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        Who has answered each item. Nobody is marked right or wrong until you show answers.
      </p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">Nobody has joined yet.</p>
      ) : (
        <div
          role="region"
          aria-label="Progress grid"
          tabIndex={0}
          className="mt-3 overflow-x-auto rounded-sm border border-line"
        >
          <table data-testid="progress-board" className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2">
                <th scope="col" className="px-3 py-2 text-left font-medium text-ink-2">
                  Name
                </th>
                {positions.map((position) => (
                  <th
                    key={position}
                    scope="col"
                    className="tabular px-2 py-2 font-medium text-ink-2"
                  >
                    <span className="sr-only">Item {position}</span>
                    <span aria-hidden="true">{position}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.participantId} className="border-t border-line bg-surface-1">
                  <th
                    scope="row"
                    className="max-w-40 truncate px-3 py-2 text-left font-normal text-ink-1"
                  >
                    {row.displayName}
                  </th>
                  {positions.map((position) => (
                    <td key={position} className="px-2 py-2 text-center">
                      <Cell answered={row.positions.includes(position)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong bg-surface-2">
                <th scope="row" className="px-3 py-2 text-left font-medium text-ink-2">
                  Answered
                </th>
                {positions.map((position) => (
                  <td
                    key={position}
                    data-testid={`answered-count-${position}`}
                    className="tabular px-2 py-2 text-center text-ink-1"
                  >
                    {progress?.answered[position - 1] ?? 0} of {rows.length}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/** One cell: a filled square with the word "Answered", or an empty outline with "Not yet". */
function Cell({ answered }: { answered: boolean }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`inline-block size-4 rounded-sm border ${
          answered ? "border-accent bg-accent" : "border-line-strong bg-transparent"
        }`}
      />
      <span className="sr-only">{answered ? "Answered" : "Not yet"}</span>
    </>
  );
}
