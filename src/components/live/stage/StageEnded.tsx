import type { EndSummary } from "@/lib/live/views";

export interface StageEndedProps {
  title: string;
  summary: EndSummary;
  /** Of every answer the class could have sent, the share it did; null when not known. */
  rate: number | null;
}

/**
 * The end of a live session on the projector (EndStage mockup, PLAN §5.11): calm numbers, no
 * podium. The questions run, who was in, and the answer rate when this screen heard every
 * question's count. Results by clinical judgment step need the stored answers, which the stage
 * does not read; they are in the teacher's report.
 */
export function StageEnded({ title, summary, rate }: StageEndedProps) {
  const tiles: [string, string][] = [
    [String(summary.questionsRun), summary.questionsRun === 1 ? "question" : "questions"],
    [String(summary.joined), "in this session"],
    ...(rate === null ? [] : ([[`${rate}%`, "of answers sent"]] as [string, string][])),
  ];
  return (
    <div className="flex h-full min-h-0 flex-col gap-[4.4cqb]">
      <header className="flex flex-col gap-[1.1cqb]">
        <p className="text-stage-label font-semibold text-ink-2">Live session ended</p>
        <h1 className="font-read text-stage-stem leading-tight">{title}</h1>
      </header>
      <dl className="grid grid-cols-3 gap-[4.4cqb] border-t-(length:--stage-stroke) border-stage-ink pt-[3cqb]">
        {tiles.map(([value, words]) => (
          <div key={words} className="flex flex-col-reverse gap-[1.1cqb]">
            <dt className="text-stage-label font-semibold text-ink-2">{words}</dt>
            <dd className="font-mono text-stage-number leading-none font-bold tabular">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-auto text-stage-label font-semibold text-ink-2">
        Your teacher has the full report. Your own results are on your phone.
      </p>
    </div>
  );
}
