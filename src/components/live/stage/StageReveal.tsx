import { RichTextView } from "@/components/question/QuestionShell";
import { ResultsChart } from "@/components/ui/ResultsChart";
import type { ResultsChartRow } from "@/components/ui/ResultsChart";
import type { ItemAggregate } from "@/lib/live/transport";
import type { RoomPlace } from "@/lib/live/views";
import type { Item, RichText } from "@/lib/ngn/schemas";
import { StageFit } from "./StageFit";
import { StageKey } from "./StageKey";
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
  /** The item with its key, from `stageKey`: null until the answer is showing. */
  keyed: Item | null;
  rationale: RichText | null;
}

/** The narrowest a key view is laid out at: the width its renderers' wide forms are drawn for. */
const KEY_MIN_WIDTH = 768;
/** How far a key view drawn at app sizes may grow: 16px text reads about 32px on a 1080p wall. */
const KEY_MAX_SCALE = 2;

/**
 * The answer showing on the projector (RevealStage mockup), for every item type
 * (feat/stage-answer-key, owner request 2026-10-27).
 *
 * A layout with one bar per option (multiple choice, select all that apply) shows how the class
 * answered on the shared chart, the key marked three ways (fill, outline, and the word "Correct"),
 * with every option's whole text: a long list wraps rather than cutting its words, and the chart is
 * scaled down to the wall when it is taller than its room (`StageFit`). Every other layout, and a
 * chart whose results have not arrived, shows the question answered with its key (`StageKey`): the
 * bowtie filled with its right choices, the matrix's right cells, the drop-downs' right words, with
 * the choices that are not correct still readable, so the teacher can talk through each one. It is
 * drawn at app sizes and scaled to fit, up to twice its size, so it reads from the back row and a
 * long one is never cut.
 *
 * The general rationale sits under either, clamped, and it gives way first (shrink-[100]): the key
 * keeps a floor of its own whatever the rationale holds. The peak of the loop, kept calm: the bars
 * grow once and nothing counts up (PLAN §7).
 */
export function StageReveal({
  place,
  answers,
  question,
  rows,
  total,
  keyed,
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
  // The key view draws the question itself, inside the part that is fitted.
  const keyView = rows === null && keyed !== null;
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
      {question === null || keyView ? null : (
        <div
          data-testid="stage-reveal-stem"
          className={long ? "hidden" : "[@container(max-height:50rem)]:hidden"}
        >
          <StageStem stem={question.stem} small />
        </div>
      )}
      {/* The chart or the key takes the room it needs, never less than a floor of its own, whatever
          the rationale holds, and is scaled to that room rather than cut. A question with neither
          keeps the same room, so the rationale sits where it always does. */}
      {rows !== null ? (
        <StageFit className="min-h-[45cqb] flex-auto">
          <ResultsChart rows={rows} total={total} size="stage" compact={long} />
        </StageFit>
      ) : keyed !== null ? (
        <StageFit
          maxScale={KEY_MAX_SCALE}
          minWidth={KEY_MIN_WIDTH}
          className="min-h-[55cqb] flex-auto"
        >
          <StageKey item={keyed} />
        </StageFit>
      ) : (
        <div className="min-h-[45cqb] flex-auto" />
      )}
      {rationale === null ? null : (
        // About four lines, and the first part to give way (shrink-[100]) when the chart needs the
        // room; two lines under a long chart or a key view, and none under either on a short
        // projector, where the key needs every line to read from the back row and a sliver of a
        // line would only be noise. The whole rationale is on every phone.
        <div
          data-testid="stage-rationale"
          className={`min-h-0 max-w-[84cqi] shrink-[100] ${long || keyView ? "line-clamp-2 [@container(max-height:50rem)]:hidden" : "line-clamp-4"} font-read text-stage-label leading-snug text-stage-ink [@container(max-height:50rem)]:text-2xl`}
        >
          <RichTextView text={rationale} />
        </div>
      )}
    </div>
  );
}
