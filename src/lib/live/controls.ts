/**
 * The teacher's moves as a console offers them: which buttons are on the screen, what each says,
 * whether it is live, and which ones ask before they act. Moved here from `HostLobby` unchanged so
 * the control view (`views.ts`) and every console share one set of rules.
 *
 * Whether a move can be taken is never decided here: that is `canRunHostCommand`, the reducer the
 * database trigger agrees with move for move. This file only decides what is drawn.
 *
 * Pure TypeScript: no React, Next or Supabase.
 */
import {
  canRunHostCommand,
  isStudentPaced,
  type HostCommand,
  type LiveSessionState,
} from "./state";

/** The moves, in the order a host reaches for them, with the word each button says. */
export const COMMAND_LABELS: Record<HostCommand, string> = {
  start: "Start",
  reveal: "Show answer",
  advance: "Next question",
  pause: "Pause",
  resume: "Resume",
  end: "End live session",
};

/**
 * Which buttons are on the screen at all. The rest is `canRunHostCommand` greying them out. A
 * student-paced room (#185) has no "Next question": every phone moves through the set by itself.
 */
export function offeredCommands(state: LiveSessionState): HostCommand[] {
  if (state.status === "ended") return [];
  if (state.status === "lobby") return ["start", "end"];
  const moves: HostCommand[] =
    state.status === "paused"
      ? ["reveal", "advance", "resume", "end"]
      : ["reveal", "advance", "pause", "end"];
  return isStudentPaced(state) ? moves.filter((command) => command !== "advance") : moves;
}

/** What a button says. One "Show answers" reveals a student-paced room's whole set (#185). */
export function commandLabel(command: HostCommand, state: LiveSessionState): string {
  return command === "reveal" && isStudentPaced(state) ? "Show answers" : COMMAND_LABELS[command];
}

/**
 * The moves that cannot be taken back, so the console asks first. Ending is final, and a
 * student-paced room's "Show answers" closes answering on every item for every student at once.
 * One item's "Show answer" does not ask: the room moves on to the next item anyway.
 */
export type AskedCommand = "end" | "reveal";

export function asksFirst(command: HostCommand, state: LiveSessionState): command is AskedCommand {
  return command === "end" || (command === "reveal" && isStudentPaced(state));
}

/** One button of a console, ready to draw. */
export interface ControlCommand {
  command: HostCommand;
  label: string;
  /** False when the reducer would refuse it now: drawn, but greyed out. */
  enabled: boolean;
  /** True when pressing it should ask first (`asksFirst`). */
  confirm: boolean;
}

/** Every button the console offers in `state`, in order. */
export function controlCommands(state: LiveSessionState): ControlCommand[] {
  return offeredCommands(state).map((command) => ({
    command,
    label: commandLabel(command, state),
    enabled: canRunHostCommand(state, command),
    confirm: asksFirst(command, state),
  }));
}
