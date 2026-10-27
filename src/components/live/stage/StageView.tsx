"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AskFirstDialog, primaryOf, useAskFirst } from "@/components/live/control/ControlBar";
import type { HostRoom } from "@/components/live/host/useHostRoom";
import { useRoomResults } from "@/components/live/results/useRoomResults";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { StageShell } from "@/components/ui/StageShell";
import type { CaseStudyRun } from "@/lib/live/caseStudyRuns";
import { controlCommands } from "@/lib/live/controls";
import type { CaseStepPlace, StageView as StageViewData } from "@/lib/live/views";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { casePlace } from "./casePlace";
import { answerRate } from "./endSummary";
import { StageEndedLive } from "./StageEndedLive";
import { StageLobby } from "./StageLobby";
import { StageQuestion } from "./StageQuestion";
import { StageReveal } from "./StageReveal";
import { chartRows, stageQuestion, stageRationale } from "./stageItem";
import { stageKey } from "./stageKey";

export interface StageViewProps {
  /** Whose top 5 the end screen asks for; absent, the end shows its summary only. */
  sessionId?: string;
  title: string;
  code: string;
  /** "learn-nclex.app/join". */
  url: string;
  /** The lobby's join panel, drawn on the server (`JoinCode` at stage size, with its QR code). */
  join?: ReactNode;
  /**
   * The join URL's QR code for the small join strip once the room has started, drawn on the
   * server like `join`. The projector's alone: no phone is handed one.
   */
  joinQr?: ReactNode;
  room: HostRoom;
  view: StageViewData;
  /** The record a session started from one case study was started with. */
  record?: EhrRecord;
  runs: readonly CaseStudyRun[];
  intervalMs: number;
  /**
   * Back to the control view: Escape, or the small button in the corner. Only for a window the
   * teacher switched in place ("Present on this screen"); a window opened as the projector gets
   * none, so a stray key or click cannot put names and live counts on the wall (code review).
   * The same window, and only it, also takes Space and the right arrow for the next move.
   */
  onExit?: () => void;
}

/** The whole record a case study step is read from, with the step to cut it at. */
function recordFor(
  step: CaseStepPlace,
  record: EhrRecord | undefined,
  runs: readonly CaseStudyRun[],
): { record: EhrRecord; step: number } | null {
  if (step.caseStudyId === null) return record === undefined ? null : { record, step: step.step };
  const run = runs.find((each) => each.caseStudyId === step.caseStudyId);
  return run?.record ? { record: run.record, step: step.step } : null;
}

/**
 * How long the stage's keys wait after the room moves (a start, a reveal, the next question), so
 * a second press a beat behind the first never skips the answer it just put up. The buttons in the
 * control view stay immediate.
 */
export const STAGE_KEY_HOLD_MS = 1_500;

/** A key pressed on something that takes it already, such as a focused button or a dialog. */
function taken(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("button, a[href], input, select, textarea, [contenteditable], dialog") !== null
  );
}

/**
 * The projector view (owner decision 3): what the room sees, with no controls on it. Always
 * light (`StageShell`), in the stage type ladder, and fed by the same hook and the same tallies
 * as the control view, so the wall and the teacher's screen never disagree.
 *
 * **No key before the reveal.** The question is read through `stageQuestion`, which copies the
 * question text and the option words and nothing else; the chart, the key view (`stageKey`) and
 * the rationale are asked for only in the answer-showing phase, and each opens only once the
 * room's reveal is set.
 *
 * Escape goes back to the control view, for a teacher presenting on the one screen they also
 * run the session from; the small button in the corner does the same for a pointer. On that one
 * screen Space and the right arrow run the control bar's primary move (Start, Show answer, Next
 * question) through the bar's own path. Ending is never bound to a key: when ending is the
 * primary move (the last answer showing, or a student-paced room with everything shown), the keys
 * do nothing, and the teacher ends from the control view. A small line in the corner says which
 * move a key runs. For `STAGE_KEY_HOLD_MS` after each move the keys do nothing.
 *
 * A screen that cannot hear the room says so in the other corner, so a stale wall is plain.
 */
export function StageView({
  sessionId,
  title,
  code,
  url,
  join,
  joinQr,
  room,
  view,
  record,
  runs,
  intervalMs,
  onExit,
}: StageViewProps) {
  const showing = view.phase === "answerShowing";
  const results = useRoomResults(
    room.askResults,
    room.state.position,
    room.state.reveal,
    showing,
    intervalMs,
  );

  const commands = controlCommands(room.state);
  const busy = room.pending !== null;
  const ask = useAskFirst(commands, (command) => void room.run(command));
  const primary = commands.find((each) => each.command === primaryOf(room.state, commands));
  // The move a key runs: only when presenting in place, only one the room would take now, and
  // never ending the session.
  const keyed =
    onExit !== undefined && primary?.enabled === true && primary.command !== "end" ? primary : null;
  const { asked, press } = ask;

  /** When the room last moved, on `performance.now()`; not on first paint, so a key works at once. */
  const { status, position, reveal } = room.state;
  const movedAt = useRef<{ move: string; at: number } | null>(null);
  useEffect(() => {
    const move = `${status}:${position}:${reveal}`;
    const last = movedAt.current;
    if (last?.move === move) return;
    movedAt.current = { move, at: last === null ? -Infinity : performance.now() };
  }, [status, position, reveal]);

  useEffect(() => {
    if (onExit === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      // An open question takes its own keys, Escape included.
      if (asked !== null) return;
      if (event.key === "Escape") {
        onExit();
        return;
      }
      if (event.key !== " " && event.key !== "ArrowRight") return;
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (taken(event.target)) return;
      event.preventDefault();
      const at = movedAt.current?.at ?? -Infinity;
      if (performance.now() - at < STAGE_KEY_HOLD_MS) return;
      if (keyed !== null && !busy) press(keyed);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, asked, keyed, busy, press]);

  return (
    <StageShell>
      <Screen
        sessionId={sessionId}
        title={title}
        code={code}
        url={url}
        join={join}
        joinQr={joinQr}
        room={room}
        view={view}
        record={record}
        runs={runs}
        results={results}
      />
      {room.connection === "connected" ? null : (
        <ConnectionStatus status={room.connection} className="absolute top-2 left-6" />
      )}
      {onExit === undefined ? null : (
        <div className="absolute top-2 right-6 flex items-center gap-4 text-sm text-ink-2">
          {keyed === null ? null : <p data-testid="stage-keys">Space: {keyed.label}</p>}
          <button
            type="button"
            onClick={onExit}
            className="opacity-70 hover:opacity-100 focus-visible:opacity-100"
          >
            Press Esc for the control view
          </button>
        </div>
      )}
      <AskFirstDialog ask={ask} state={room.state} busy={busy} />
    </StageShell>
  );
}

function Screen({
  sessionId,
  title,
  code,
  url,
  join,
  joinQr,
  room,
  view,
  record,
  runs,
  results,
}: Omit<StageViewProps, "intervalMs" | "onExit"> & {
  results: ReturnType<typeof useRoomResults>;
}) {
  switch (view.phase) {
    case "lobby":
      return <StageLobby title={title} code={code} url={url} join={join} names={view.names} />;
    case "ended":
      return (
        <StageEndedLive
          sessionId={sessionId}
          title={title}
          summary={view.summary}
          rate={answerRate(room.heard, view.summary.questionsRun, view.summary.joined)}
        />
      );
    case "answerShowing": {
      const rows = chartRows(results, true);
      return (
        <StageReveal
          place={view.place}
          answers={room.answersOn}
          question={stageQuestion(room.item)}
          rows={rows}
          total={results?.responded ?? 0}
          keyed={stageKey(room.item, room.state.reveal)}
          rationale={stageRationale(room.item, room.state.reveal)}
        />
      );
    }
    default: {
      const step = view.phase === "caseStep" ? view.caseStep : null;
      const at = step === null ? null : recordFor(step, record, runs);
      return (
        <StageQuestion
          place={view.place}
          answers={room.answersOn}
          timer={view.timer}
          question={stageQuestion(room.item)}
          casePlace={at === null ? null : casePlace(at.record, at.step)}
          paused={view.phase === "paused"}
          url={url}
          code={code}
          joinQr={joinQr}
          serverNow={room.serverNow}
        />
      );
    }
  }
}
