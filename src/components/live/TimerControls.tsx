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
 * to; `chooseTimer` says why.
 *
 * A native `select`, which is keyboard- and screen-reader-operable without any help, at 44px tall.
 */
export function TimeChoice({ state, busy, onChoose, className = "" }: TimeChoiceProps) {
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
    </div>
  );
}

export interface TimerButtonsProps {
  state: LiveSessionState;
  /** True while any move is in flight, so nothing is pressed twice. */
  busy: boolean;
  /** Which timer button's press is in flight, if either: that one shows it is working. */
  pending?: TimerCommand | null;
  onCommand: (command: TimerCommand) => void;
}

const TIMER_BUTTONS: readonly { command: TimerCommand; label: string }[] = [
  { command: "extend_timer", label: "Add 15 seconds" },
  { command: "stop_timer", label: "Stop timer" },
];

/**
 * "Add 15 seconds" and "Stop timer", for the question showing (WCAG 2.2.1: extending is one tap
 * away). Disabled, in the disabled look, only when the same reducer that would refuse them says
 * so: an item with no clock. While a move is in flight they stay as they are, enabled secondary
 * buttons that take no second press (docs/04 §11, "Busy, not disabled"), and the one pressed
 * shows it is working, so the pair never flickers grey under the teacher's thumb.
 */
export function TimerButtons({ state, busy, pending = null, onCommand }: TimerButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {TIMER_BUTTONS.map(({ command, label }) => {
        const held = busy && pending !== command;
        return (
          <Button
            key={command}
            variant="secondary"
            disabled={!canRunHostCommand(state, command)}
            busy={pending === command}
            {...(held ? { "aria-disabled": true } : {})}
            onClick={() => {
              if (!busy) onCommand(command);
            }}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}
