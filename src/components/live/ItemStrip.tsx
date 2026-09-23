"use client";

import { useState } from "react";
import { canGoTo, type ItemAggregate, type LiveSessionState } from "@/lib/live";

export interface ItemStripProps {
  state: LiveSessionState;
  /**
   * The newest tally the console holds — pushed for the item just left, or polled for the item
   * showing. The strip keeps each one it sees, by position, so it can show how many answered every
   * item it has heard about without asking for anything of its own.
   */
  tally: ItemAggregate | null;
  /** True while a move is in flight, so nothing is pressed twice. */
  busy: boolean;
  onGoto: (position: number) => void;
}

/** What the strip has heard: answered counts by position, and the positions whose key was shown. */
interface Heard {
  tally: ItemAggregate | null;
  counts: Readonly<Record<number, number>>;
  shown: readonly number[];
}

/**
 * Keeps what this console has been told about each item. React's "adjust state when a prop
 * changes" pattern, during render: a new tally or a reveal is folded in once, and never mutated.
 *
 * Only what this console has seen — a console reloaded mid-session starts again from the item it
 * opens on. Deliberately so: the counts are a convenience for choosing where to jump, the room's
 * record is the report, and asking the database for every item's tally on open would be a read
 * the host console has never needed before (ADR 0002 keeps them cheap).
 */
function useHeard(state: LiveSessionState, tally: ItemAggregate | null): Heard {
  const [heard, setHeard] = useState<Heard>({ tally: null, counts: {}, shown: [] });
  const newTally = tally !== heard.tally;
  const newReveal =
    state.reveal && state.position !== null && !heard.shown.includes(state.position);
  if (newTally || newReveal) {
    const next: Heard = {
      tally,
      counts:
        newTally && tally !== null
          ? { ...heard.counts, [tally.position]: tally.responded }
          : heard.counts,
      shown: newReveal ? [...heard.shown, state.position as number] : heard.shown,
    };
    setHeard(next);
    return next;
  }
  return heard;
}

/** "On now. 3 answered. Answer shown." — the parts that are known, in that order. */
function detailOf(position: number, state: LiveSessionState, heard: Heard): string {
  const parts: string[] = [];
  if (position === state.position) parts.push("On now.");
  const count = heard.counts[position];
  if (count !== undefined) parts.push(`${count} answered.`);
  const shownNow = position === state.position && state.reveal;
  if (shownNow || (position !== state.position && heard.shown.includes(position))) {
    parts.push("Answer shown.");
  }
  return parts.join(" ");
}

/**
 * The host's item strip (#183): every item in the set, the one the room is on marked, and a jump
 * to any other, forwards or back.
 *
 * Each item is a native `button` in reading order, so it is reached with Tab and pressed with
 * Enter or Space; the one the room is on carries `aria-current="step"` and is disabled, because
 * `goToItem` refuses it as `same_item`. Whether a jump is offered at all is `canGoTo`, the same
 * reducer the adapters enforce, so the greyed-out button and the refusal cannot drift apart.
 *
 * No motion: a jump is a state change, not an animation, and the items do not move.
 */
export function ItemStrip({ state, tally, busy, onGoto }: ItemStripProps) {
  const heard = useHeard(state, tally);
  if (state.status !== "running" && state.status !== "paused") return null;
  const positions = Array.from({ length: state.itemCount }, (_, index) => index + 1);

  return (
    <nav aria-labelledby="items-heading" className="mt-6">
      <h2 id="items-heading" className="font-read text-xl text-ink-1">
        Items
      </h2>
      <ol className="mt-3 flex flex-wrap gap-2">
        {positions.map((position) => {
          const current = position === state.position;
          const detail = detailOf(position, state, heard);
          const detailId = `item-strip-${position}`;
          return (
            <li key={position}>
              <button
                type="button"
                aria-label={`Go to item ${position}`}
                aria-current={current ? "step" : undefined}
                aria-describedby={detail === "" ? undefined : detailId}
                disabled={busy || !canGoTo(state, position)}
                onClick={() => onGoto(position)}
                className={
                  "tap-target flex min-w-16 flex-col items-center justify-center rounded-sm px-3 py-1 " +
                  "text-ink-1 disabled:cursor-not-allowed " +
                  (current
                    ? "border-2 border-accent bg-accent-soft"
                    : "border border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2 disabled:opacity-50")
                }
              >
                <span className="tabular text-base font-medium">{position}</span>
                {/* The short form is for eyes; a screen reader gets the sentence below instead. */}
                <span aria-hidden="true" className="min-h-4 text-xs text-ink-2">
                  {shortDetail(position, state, heard)}
                </span>
                {detail === "" ? null : (
                  <span id={detailId} className="sr-only">
                    {detail}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** What fits under the number: the count, and a mark for a shown answer. */
function shortDetail(position: number, state: LiveSessionState, heard: Heard): string {
  const count = heard.counts[position];
  const shown =
    (position === state.position && state.reveal) ||
    (position !== state.position && heard.shown.includes(position));
  const parts = [count === undefined ? null : `${count} in`, shown ? "shown" : null];
  return parts.filter((part) => part !== null).join(" · ");
}
