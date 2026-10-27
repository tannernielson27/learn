import type { EndSummary } from "@/lib/live/views";

export interface StageEndedProps {
  title: string;
  summary: EndSummary;
  /** Of every answer the class could have sent, the share it did; null when not known. */
  rate: number | null;
}

/** The session's numbers, each as [value, words]: what the summary and the podium's footer show. */
export function endTiles(summary: EndSummary, rate: number | null): [string, string][] {
  return [
    [String(summary.questionsRun), summary.questionsRun === 1 ? "question" : "questions"],
    [String(summary.joined), "in this session"],
    ...(rate === null ? [] : ([[`${rate}%`, "of answers sent"]] as [string, string][])),
  ];
}

/**
 * The end of a live session on the projector, in numbers (EndStage mockup, PLAN §5.11): the
 * questions run, who was in, and the answer rate when this screen heard every question's count.
 * Results by clinical judgment step need the stored answers, which the stage does not read; they
 * are in the teacher's report.
 *
 * Since the owner asked for a podium (2026-10-24), this is what the stage shows while the top 5 is
 * on its way and whenever there is none: no question scored, or nobody earned a point
 * (`StageEndedLive`). With a podium, the same numbers run along its foot (`StagePodium`).
 */
export function StageEnded({ title, summary, rate }: StageEndedProps) {
  const tiles = endTiles(summary, rate);
  return (
    <div className="flex h-full min-h-0 flex-col gap-[4.4cqb]">
      <div className="flex flex-col gap-[1.1cqb]">
        <p className="text-stage-label font-semibold text-ink-2">Live session ended</p>
        <h1 className="font-read text-stage-stem leading-tight">{title}</h1>
      </div>
      <dl className="grid grid-cols-3 gap-[4.4cqb] border-t-(length:--stage-stroke) border-stage-ink pt-[3cqb]">
        {tiles.map(([value, words]) => (
          <div key={words} className="flex flex-col-reverse gap-[1.1cqb]">
            <dt className="text-stage-label font-semibold text-ink-2">{words}</dt>
            <dd className="font-mono text-stage-number leading-none font-bold tabular">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
