"use client";

import { useEffect, type ReactNode } from "react";
import type { HostRoom } from "@/components/live/host/useHostRoom";
import { useRoomResults } from "@/components/live/results/useRoomResults";
import { StageShell } from "@/components/ui/StageShell";
import type { CaseStudyRun } from "@/lib/live/caseStudyRuns";
import type { CaseStepPlace, StageView as StageViewData } from "@/lib/live/views";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { casePlace } from "./casePlace";
import { answerRate } from "./endSummary";
import { StageEndedLive } from "./StageEndedLive";
import { StageLobby } from "./StageLobby";
import { StageQuestion } from "./StageQuestion";
import { StageReveal } from "./StageReveal";
import { chartRows, stageQuestion, stageRationale } from "./stageItem";

export interface StageViewProps {
  /** Whose top 5 the end screen asks for; absent, the end shows its summary only. */
  sessionId?: string;
  title: string;
  code: string;
  /** "learn-nclex.app/join". */
  url: string;
  /** The lobby's join panel, drawn on the server (`JoinCode` at stage size, with its QR code). */
  join?: ReactNode;
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
 * The projector view (owner decision 3): what the room sees, with no controls on it. Always
 * light (`StageShell`), in the stage type ladder, and fed by the same hook and the same tallies
 * as the control view, so the wall and the teacher's screen never disagree.
 *
 * **No key before the reveal.** The question is read through `stageQuestion`, which copies the
 * question text and the option words and nothing else; the chart and the rationale are asked
 * for only in the answer-showing phase, and the chart marks the key only then.
 *
 * Escape goes back to the control view, for a teacher presenting on the one screen they also
 * run the session from; the small button in the corner does the same for a pointer.
 */
export function StageView({
  sessionId,
  title,
  code,
  url,
  join,
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

  useEffect(() => {
    if (onExit === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  return (
    <StageShell>
      <Screen
        sessionId={sessionId}
        title={title}
        code={code}
        url={url}
        join={join}
        room={room}
        view={view}
        record={record}
        runs={runs}
        results={results}
      />
      {onExit === undefined ? null : (
        <button
          type="button"
          onClick={onExit}
          className="absolute top-2 right-6 text-sm text-ink-2 opacity-70 hover:opacity-100 focus-visible:opacity-100"
        >
          Press Esc for the control view
        </button>
      )}
    </StageShell>
  );
}

function Screen({
  sessionId,
  title,
  code,
  url,
  join,
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
          serverNow={room.serverNow}
        />
      );
    }
  }
}
