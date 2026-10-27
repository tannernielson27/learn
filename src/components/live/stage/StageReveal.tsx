import { RichTextView } from "@/components/question/QuestionShell";
import { ResultsChart } from "@/components/ui/ResultsChart";
import type { ResultsChartRow } from "@/components/ui/ResultsChart";
import type { ItemAggregate } from "@/lib/live/transport";
import type { RoomPlace } from "@/lib/live/views";
import type { RichText } from "@/lib/ngn/schemas";
import { StageStem, StageStrip } from "./StageParts";
import { crowded, type StageQuestion } from "./stageItem";

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
 * "Correct"), and the general rationale under it, clamped to about four lines so it can never
 * squeeze the chart in the fixed stage. The peak of the loop, kept calm: the bars grow
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
  // A crowded chart needs the whole wall, so its question gives way at every size, not only
  // short, and its rows are compact.
  const long =
    rows !== null &&
    crowded(
      question?.stem.value ?? "",
      rows.map((row) => row.label),
    );
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
      {/* On a short projector, or over a long chart, the question gives way to the chart and the
          rationale: it is on every phone, and the class has just read it. */}
      {question === null ? null : (
        <div
          data-testid="stage-reveal-stem"
          className={long ? "hidden" : "[@container(max-height:50rem)]:hidden"}
        >
          <StageStem stem={question.stem} small />
        </div>
      )}
      {/* The chart takes the room its bars need, never less than a floor of its own, whatever the
          rationale holds. A question with no chart keeps the same room, so the rationale sits
          where it always does. */}
      <div className="min-h-[45cqb] flex-auto overflow-hidden">
        {rows === null ? null : (
          <ResultsChart rows={rows} total={total} size="stage" compact={long} />
        )}
      </div>
      {rationale === null ? null : (
        // About four lines, and the first part to give way (shrink-[100]) when the chart needs the
        // room; two lines under a long chart, and none under one on a short projector, where a
        // sliver of a line would only be noise. The whole rationale is on every phone.
        <div
          data-testid="stage-rationale"
          className={`min-h-0 max-w-[84cqi] shrink-[100] ${long ? "line-clamp-2 [@container(max-height:50rem)]:hidden" : "line-clamp-4"} font-read text-stage-label leading-snug text-stage-ink [@container(max-height:50rem)]:text-2xl`}
        >
          <RichTextView text={rationale} />
        </div>
      )}
    </div>
  );
}
