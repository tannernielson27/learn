"use client";

import { Countdown } from "@/components/live/Countdown";
import { AnswerCount } from "@/components/ui/AnswerCount";
import type { ItemTimer } from "@/lib/live/timer";
import type { ItemAggregate } from "@/lib/live/transport";
import type { RoomPlace } from "@/lib/live/views";
import type { CasePlace } from "./casePlace";
import { JoinStrip, StageOptions, StageStrip } from "./StageParts";
import { StageStemFit } from "./StageStemFit";
import { crowded, type StageQuestion as StageQuestionData } from "./stageItem";

export interface StageQuestionProps {
  place: RoomPlace;
  /** The console's tally for this question, the same one the control view counts from. */
  answers: Pick<ItemAggregate, "responded" | "present"> | null;
  timer: ItemTimer;
  /** The question text and lettered options, never the key. Null until the item has arrived. */
  question: StageQuestionData | null;
  /** For a case study step: the patient, the time, and the tabs new at this step. */
  casePlace: CasePlace | null;
  paused: boolean;
  url: string;
  code: string;
  serverNow: () => number;
}

/**
 * A question on the projector while answers come in (QuestionStage, CaseStage mockups): where
 * the room is, the question and its lettered options, the clock and how many have answered. A
 * count, never who (owner decision 4), and no tallies by option until the answer is shown.
 *
 * A case study step adds the patient header and the tab that is new, and leaves the record
 * itself on the phones (PLAN §6). A paused room keeps the question up with its clock held.
 */
export function StageQuestion({
  place,
  answers,
  timer,
  question,
  casePlace,
  paused,
  url,
  code,
  serverNow,
}: StageQuestionProps) {
  const where = [place.label, paused ? "Paused" : null].filter(Boolean).join(" · ");
  // More than a short projector holds at full size: the stem is clamped and the options compact.
  const dense =
    question?.options != null &&
    crowded(
      question.stem.value,
      question.options.map((option) => option.label),
    );
  return (
    <div className="flex h-full min-h-0 flex-col gap-[2.6cqb]">
      {casePlace === null ? null : (
        <section
          aria-label="Patient"
          className="flex flex-wrap items-center justify-between gap-x-[3cqb] rounded-md border-(length:--stage-stroke) border-stage-line px-[2.6cqb] py-[1.8cqb]"
        >
          <p className="text-stage-label font-semibold text-stage-ink">{casePlace.patient}</p>
          {casePlace.time === null ? null : (
            <p className="font-mono text-stage-label font-semibold text-stage-ink">
              {casePlace.time}
            </p>
          )}
        </section>
      )}
      <StageStrip
        left={<span className="tabular">{where}</span>}
        right={
          casePlace !== null && casePlace.newTabs.length > 0 ? (
            <>
              New in the record:{" "}
              <span className="text-stage-ink">{casePlace.newTabs.join(", ")}</span>
            </>
          ) : (
            <JoinStrip url={url} code={code} />
          )
        }
      />
      {/* The one part that gives way on a short projector (1280x720), so the clock and the count
          below always stay on the wall. Inside it the options give way row by row (StageOptions),
          after a long list's stem has been clamped, so every row stays on the wall too. A stem too
          long for that is fitted, and scrolled only at its floor (StageStemFit). */}
      <div className="flex min-h-0 flex-1 flex-col gap-[2.6cqb] overflow-hidden">
        {question === null ? (
          <p className="text-stage-option text-ink-2">The question is on its way.</p>
        ) : (
          <>
            <h1 className="sr-only">{place.label ?? "Question"}</h1>
            <StageStemFit
              key={`${place.position}:${dense}:${question.stem.value}`}
              stem={question.stem}
              clamp={dense}
            />
            {question.options === null ? (
              <p className="text-stage-option text-ink-2">Answer on your phone.</p>
            ) : (
              <StageOptions options={question.options} compact={dense} />
            )}
          </>
        )}
      </div>
      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-end gap-[6cqi]">
        <div className="flex min-w-0 flex-col gap-[1.5cqb]">
          {casePlace === null ? null : (
            <p className="text-stage-label font-semibold text-ink-2">
              Patient record is on your phone.
            </p>
          )}
          <Countdown timer={timer} now={serverNow} size="stage" />
        </div>
        {answers === null ? (
          <span />
        ) : (
          <AnswerCount answered={answers.responded} total={answers.present} size="stage" />
        )}
      </div>
    </div>
  );
}
