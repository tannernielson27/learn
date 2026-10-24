"use client";

import { Countdown } from "@/components/live/Countdown";
import { HostRecord } from "@/components/live/HostRecord";
import { ItemStrip } from "@/components/live/ItemStrip";
import { Roster } from "@/components/live/Roster";
import { HostResults } from "@/components/live/results/HostResults";
import { AutoStopChoice, TimeChoice, TimerButtons } from "@/components/live/TimerControls";
import { RichTextView } from "@/components/question/QuestionShell";
import { AnswerCount } from "@/components/ui/AnswerCount";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { hasClock, type LiveSessionState, type TimerCommand } from "@/lib/live";
import type { CaseStudyRun } from "@/lib/live/caseStudyRuns";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { useAutoStopSetting } from "@/components/live/host/useAutoStopSetting";
import { useAutoStopTimer } from "@/components/live/host/useAutoStopTimer";
import type { HostRoom } from "@/components/live/host/useHostRoom";
import { NotAnsweredList } from "./NotAnsweredList";
import { useNotAnswered } from "./useNotAnswered";

export interface ControlItemProps {
  sessionId: string;
  room: HostRoom;
  /** "Question 3 of 20", "Step 2 of 6: Analyze Cues" (`positionLabel`). */
  position: string | null;
  /** The case study whose step the room is on, in a whole quiz (#469). */
  place: { run: CaseStudyRun; step: number } | null;
  record?: EhrRecord;
  intervalMs: number;
}

/** "Answer showing", or nothing while answers are still coming in. */
const revealWords = (state: LiveSessionState) => (state.reveal ? "Answer showing" : null);

/**
 * One question on the teacher's control view (QuestionControl mockup): the question and the
 * private distribution on the left; how many have answered, the clock, who has not answered yet,
 * the jump to another question and the time per question on the right. One column on a phone.
 *
 * Everything here is the teacher's alone. The projector shows the counts only once the answer is
 * shown, and never a name after the lobby.
 */
export function ControlItem({
  sessionId,
  room,
  position,
  place,
  record,
  intervalMs,
}: ControlItemProps) {
  const { state, answersOn, item, roster, pending } = room;
  const busy = pending !== null;
  const collecting = state.status === "running" && !state.reveal;
  const waiting = useNotAnswered(room.askProgress, roster, state.position, collecting, intervalMs);
  const eyebrow = [position, revealWords(state)].filter(Boolean).join(" · ");
  const timerCommand = (command: TimerCommand) => void room.run(command);
  // Here, in the control view only: a projector window has no controls and never sends it.
  const [autoStop, setAutoStop] = useAutoStopSetting();
  const autoStopped = useAutoStopTimer(room, autoStop) !== null;
  const timed = state.timer.seconds !== null || hasClock(state.timer);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
      <div className="flex min-w-0 flex-col gap-4">
        <p className="eyebrow tabular">{eyebrow}</p>
        {place === null ? null : (
          <p data-testid="host-case-study" className="text-sm break-words text-ink-2">
            Case study: <span className="text-ink-1">{place.run.title}</span>
          </p>
        )}
        {item === null ? (
          <p className="text-ink-2">Loading the question.</p>
        ) : (
          <RichTextView text={item.stem} className="stem" />
        )}
        <HostResults
          sessionId={sessionId}
          ask={room.askResults}
          position={state.position}
          revealed={state.reveal}
          active={room.onAnItem}
          intervalMs={intervalMs}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section
          aria-label="Answers and time"
          className="flex flex-col gap-3.5 rounded-md border border-line bg-surface-1 p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-ink-1">Answered</h2>
            {answersOn === null ? (
              <p className="text-sm text-ink-2">Counting</p>
            ) : (
              <div aria-live="polite">
                <AnswerCount answered={answersOn.responded} total={answersOn.present} />
              </div>
            )}
          </div>
          <ProgressBar
            size="lg"
            label="Answered"
            value={answersOn?.responded ?? 0}
            max={answersOn?.present ?? 0}
            valueText={
              answersOn === null
                ? "Counting"
                : `${answersOn.responded} of ${answersOn.present} answered`
            }
          />
          <Countdown timer={state.timer} now={room.serverNow} />
          <p role="status" className="text-sm text-ink-2 empty:hidden">
            {autoStopped ? "Everyone answered. Timer ended." : null}
          </p>
          <TimerButtons state={state} busy={busy} onCommand={timerCommand} />
          {timed ? <AutoStopChoice on={autoStop} onChange={setAutoStop} /> : null}
        </section>

        {collecting ? <NotAnsweredList people={waiting} /> : null}

        <ItemStrip
          state={state}
          tally={room.tally}
          busy={busy}
          onGoto={(to) => void room.jump(to)}
        />
        <TimeChoice
          state={state}
          busy={busy}
          onChoose={(seconds) => void room.chooseTime(seconds)}
        />

        {record === undefined ? null : <HostRecord record={record} position={state.position} />}
        {place?.run.record ? (
          // The case study's own steps count from its first position: its step is the position
          // HostRecord marks. Keyed by the case study, so moving to the next one starts its chart
          // at its own first time and tab.
          <HostRecord
            key={place.run.firstPosition}
            record={place.run.record}
            position={place.step}
            title={place.run.title}
          />
        ) : null}

        {/* Who is connected, through every question as in the lobby: a phone that drops out
            mid-question shows here, and the count is what the teacher waits on. */}
        <Roster roster={roster} />
      </div>
    </div>
  );
}
