"use client";

import { Button } from "@/components/ui/Button";
import { fieldClasses } from "@/components/ui/fieldClasses";
import {
  TIMER_CHOICES,
  canRunHostCommand,
  type LiveSessionState,
  type TimerChoice,
  type TimerCommand,
} from "@/lib/live";

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

export interface TimeChoiceProps {
  state: LiveSessionState;
  /** True while a move is in flight, so nothing is pressed twice. */
  busy: boolean;
  onChoose: (seconds: number | null) => void;
  className?: string;
}

/**
 * How long each question gets (#182). The choice applies from the next question the room moves
 * to — `chooseTimer` says why — and the hint under it says so once a question is up, so a teacher
 * who picks a minute halfway through is not surprised that the clock on the screen did not jump.
 *
 * A native `select`, which is keyboard- and screen-reader-operable without any help, at 44px tall.
 */
export function TimeChoice({ state, busy, onChoose, className = "" }: TimeChoiceProps) {
  const onItem = state.status === "running" || state.status === "paused";
  const current = state.timer.seconds;
  // A time set some other way than this console (the column allows 5 to 3600 seconds) is still
  // shown as what it is, rather than as a choice it is not.
  const unlisted = current !== null && !(TIMER_CHOICES as readonly unknown[]).includes(current);

  return (
    <div className={`flex max-w-80 flex-col gap-2 ${className}`.trim()}>
      <label htmlFor="timer-seconds" className="text-sm font-medium text-ink-1">
        Time per question
      </label>
      <select
        id="timer-seconds"
        value={valueOf(current)}
        disabled={busy}
        aria-describedby="timer-hint"
        onChange={(event) =>
          onChoose(event.target.value === OFF ? null : Number(event.target.value))
        }
        className={fieldClasses("px-3 text-base")}
      >
        {TIMER_CHOICES.map((choice) => (
          <option key={valueOf(choice)} value={valueOf(choice)}>
            {CHOICE_LABELS[valueOf(choice)]}
          </option>
        ))}
        {unlisted ? <option value={valueOf(current)}>{current} seconds</option> : null}
      </select>
      <p id="timer-hint" className="text-sm text-ink-2">
        {onItem
          ? "A new time applies from the next question."
          : "You can add time or stop the timer during a question."}
      </p>
    </div>
  );
}

export interface TimerButtonsProps {
  state: LiveSessionState;
  busy: boolean;
  onCommand: (command: TimerCommand) => void;
}

/**
 * "Add 15 seconds" and "Stop timer", for the question showing (WCAG 2.2.1: extending is one tap
 * away). Greyed out by the same reducer that would refuse them.
 */
export function TimerButtons({ state, busy, onCommand }: TimerButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
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
    </div>
  );
}
