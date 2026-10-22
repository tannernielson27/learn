"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { HostCommand, LiveSessionState } from "@/lib/live";
import type { AskedCommand, ControlCommand } from "@/lib/live/controls";

export interface ControlBarProps {
  state: LiveSessionState;
  /** The buttons on offer, from `controlView` (`controls.ts`): label, live or greyed, asks first. */
  commands: readonly ControlCommand[];
  /** True while a move is in flight, so nothing is pressed twice. */
  busy: boolean;
  onCommand: (command: HostCommand) => void;
  /** "20 questions", shown beside the buttons where there is room. */
  summary?: string;
}

/** "1 question", "3 questions". */
export const questions = (count: number): string =>
  count === 1 ? "1 question" : `${count} questions`;

/** What the question says, and what its two buttons say. */
function question(command: AskedCommand, state: LiveSessionState) {
  return command === "end"
    ? {
        title: "End this live session?",
        detail: "Students are disconnected and the join code stops working. You can't reopen it.",
        cancel: "Keep it open",
      }
    : {
        title: `Show answers for all ${questions(state.itemCount)}?`,
        detail: "Students who haven't finished can't answer any more.",
        cancel: "Not yet",
      };
}

/**
 * The one primary move for where the room is (PLAN §4, Hick): Start in the lobby, Show answer
 * while answers come in, Next question once it is showing, and End once the last one is. Every
 * other move is secondary, and ending is quiet: it asks first, in words, rather than being red.
 */
function primaryOf(state: LiveSessionState, commands: readonly ControlCommand[]): HostCommand {
  if (state.status === "lobby") return "start";
  const live = (command: HostCommand) =>
    commands.some((each) => each.command === command && each.enabled);
  if (!state.reveal) return "reveal";
  // Shown on the last question: nothing is left to move on to, so ending is the next move.
  return live("advance") || !live("end") ? "advance" : "end";
}

/**
 * The teacher's moves, in one bar at the bottom of the control view (QuestionControl mockup):
 * End and Pause on the left, the moves that take the room forward on the right, with the primary
 * last. On a phone the primary is full width on top, in thumb reach (LobbyControlPhone mockup).
 *
 * Ending, and a student-paced room's "Show answers", ask first through `ConfirmDialog`; whether a
 * move may be taken at all is the reducer's (`canRunHostCommand`), never this bar's.
 */
export function ControlBar({ state, commands, busy, onCommand, summary }: ControlBarProps) {
  const [asking, setAsking] = useState<AskedCommand | null>(null);
  // A question about a move the room no longer offers (another tab ended it) is not asked.
  const askedCommand = commands.find(
    (each) => each.command === asking && each.enabled && each.confirm,
  );
  const asked = askedCommand ? (asking as AskedCommand) : null;
  const primary = primaryOf(state, commands);

  function press(command: ControlCommand) {
    if (command.confirm) setAsking(command.command as AskedCommand);
    else onCommand(command.command);
  }

  const forward = commands.filter((each) => each.command === "advance" && each.command !== primary);
  const main = commands.find((each) => each.command === primary);
  const side = commands.filter((each) => each.command !== primary && each.command !== "advance");

  const draw = (command: ControlCommand, variant: "primary" | "secondary" | "ghost") => (
    <Button
      key={command.command}
      variant={variant}
      size={variant === "ghost" ? "md" : "lg"}
      disabled={busy || !command.enabled}
      onClick={() => press(command)}
      className={variant === "primary" ? "max-sm:w-full sm:min-w-44" : ""}
    >
      {command.label}
    </Button>
  );

  return (
    <>
      <div
        data-testid="control-bar"
        className="sticky bottom-0 z-1 border-t border-line bg-surface-1 px-4 py-3 [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] sm:px-8"
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {side.map((command) =>
              draw(command, command.command === "end" ? "ghost" : "secondary"),
            )}
            {summary ? <p className="text-sm text-ink-2 max-md:hidden">{summary}</p> : null}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:gap-3">
            {forward.map((command) => draw(command, "secondary"))}
            {main ? draw(main, "primary") : null}
          </div>
        </div>
      </div>
      {asked === null ? null : (
        <ConfirmDialog
          open
          title={question(asked, state).title}
          description={question(asked, state).detail}
          confirmLabel={askedCommand?.label ?? ""}
          cancelLabel={question(asked, state).cancel}
          busy={busy}
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            setAsking(null);
            onCommand(asked);
          }}
        />
      )}
    </>
  );
}
