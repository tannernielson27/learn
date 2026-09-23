"use client";

import { Button } from "@/components/ui/Button";
import {
  TIMER_CHOICES,
  canRunHostCommand,
  hasClock,
  type LiveSessionState,
  type TimerChoice,
  type TimerCommand,
} from "@/lib/live";

export interface TimerControlsProps {
  state: LiveSessionState;
  /** True while a move is in flight, so nothing is pressed twice. */
  busy: boolean;
  onChoose: (seconds: number | null) => void;
  onCommand: (command: TimerCommand) => void;
}

const CHOICE_LABELS: Record<string, string> = {
  off: "Off",
  "30": "30 seconds",
  "60": "1 minute",
  "90": "90 seconds",
  "120": "2 minutes",
};

const OFF = "off";

const valueOf = (seconds: TimerChoice | number | null): string =>
  seconds === null ? OFF : String(seconds);

/**
 * The host's timer (#182): how long each item gets, and the two buttons for the item showing.
 *
 * The choice applies from the next item the room moves to — `chooseTimer` says why — and the hint
 * under it says so, so a host who picks a minute halfway through an item is not surprised that the
 * clock on the screen did not jump. "Add 15 seconds" and "Stop timer" are for the item showing,
 * greyed out by the same reducer that would refuse them.
 *
 * A native `select`, which is keyboard- and screen-reader-operable without any help, and at 44px
 * tall like every other control here.
 */
export function TimerControls({ state, busy, onChoose, onCommand }: TimerControlsProps) {
  const onItem = state.status === "running" || state.status === "paused";
  const current = state.timer.seconds;
  // A time set some other way than this console (the column allows 5 to 3600 seconds) is still
  // shown as what it is, rather than as a choice it is not.
  const unlisted = current !== null && !(TIMER_CHOICES as readonly unknown[]).includes(current);

  return (
    <section aria-labelledby="timer-heading" className="mt-6">
      <h2 id="timer-heading" className="font-read text-xl text-ink-1">
        Timer
      </h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="timer-seconds" className="text-sm text-ink-1">
            Time per item
          </label>
          <select
            id="timer-seconds"
            value={valueOf(current)}
            disabled={busy}
            aria-describedby="timer-hint"
            onChange={(event) =>
              onChoose(event.target.value === OFF ? null : Number(event.target.value))
            }
            className="tap-target min-w-40 rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong"
          >
            {TIMER_CHOICES.map((choice) => (
              <option key={valueOf(choice)} value={valueOf(choice)}>
                {CHOICE_LABELS[valueOf(choice)]}
              </option>
            ))}
            {unlisted ? <option value={valueOf(current)}>{current} seconds</option> : null}
          </select>
        </div>
        {onItem ? (
          <>
            <Button
              disabled={busy || !canRunHostCommand(state, "extend_timer")}
              onClick={() => onCommand("extend_timer")}
            >
              Add 15 seconds
            </Button>
            <Button
              disabled={busy || !canRunHostCommand(state, "stop_timer")}
              onClick={() => onCommand("stop_timer")}
            >
              Stop timer
            </Button>
          </>
        ) : null}
      </div>
      <p id="timer-hint" className="mt-2 text-sm text-ink-2">
        {onItem
          ? hasClock(state.timer)
            ? "A new time applies from the next item. When time is up, answers stop being taken; the room does not move on by itself."
            : "No timer on this item. A new time applies from the next item."
          : "Each item gets this long once the session starts. When time is up, answers stop being taken; you still move the room on."}
      </p>
    </section>
  );
}
