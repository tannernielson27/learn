import { RichTextView } from "@/components/question/QuestionShell";
import { ResultsChart } from "@/components/ui/ResultsChart";
import type { ResultsChartRow } from "@/components/ui/ResultsChart";
import type { ItemAggregate } from "@/lib/live/transport";
import type { RoomPlace } from "@/lib/live/views";
import type { RichText } from "@/lib/ngn/schemas";
import { StageStem, StageStrip } from "./StageParts";
import type { StageQuestion } from "./stageItem";

export interface StageRevealProps {
  place: RoomPlace;
  answers: Pick<ItemAggregate, "responded" | "present"> | null;
  question: StageQuestion | null;
  /** One row per option with the key marked; null for a layout without one bar per option. */
  rows: readonly ResultsChartRow[] | null;
  /** What the shares are out of: the answers received. */
  total: number;
  rationale: RichText | null;
}

/**
 * The answer showing on the projector (RevealStage mockup): how the class answered, option by
 * option on the shared chart with the key marked three ways (fill, outline, and the word
 * "Correct"), and the general rationale under it. The peak of the loop, kept calm: the bars grow
 * once and nothing counts up (PLAN §7).
 *
 * A layout without one bar per option (matrix, cloze, bowtie...) shows the question and the
 * rationale; each phone shows its own marks.
 */
export function StageReveal({
  place,
  answers,
  question,
  rows,
  total,
  rationale,
}: StageRevealProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-[3cqb]">
      <StageStrip
        left={
          <span className="tabular">{[place.label, "Answer"].filter(Boolean).join(" · ")}</span>
        }
        right={
          answers === null ? undefined : (
            <span className="tabular">
              <span className="font-mono text-stage-ink">{answers.responded}</span> of{" "}
              <span className="font-mono text-stage-ink">{answers.present}</span> answered
            </span>
          )
        }
      />
      <h1 className="sr-only">{place.label === null ? "Answer" : `${place.label}: answer`}</h1>
      {question === null ? null : <StageStem stem={question.stem} small />}
      {rows === null ? (
        <p className="text-stage-option text-ink-2">Each phone shows its own marks.</p>
      ) : (
        <ResultsChart rows={rows} total={total} size="stage" />
      )}
      {rationale === null ? null : (
        <div className="mt-auto max-w-[84cqi] font-read text-stage-label leading-snug text-stage-ink">
          <RichTextView text={rationale} />
        </div>
      )}
    </div>
  );
}
