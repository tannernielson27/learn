import { formatPoints } from "@/lib/assignments/resultsSummary";

export interface ScoreFigureProps {
  points: number;
  maxPoints: number;
  /** The words after the figure: "points · 70%", or "all correct". */
  caption: string;
}

/**
 * The total, as the results mockups set it: a big mono figure over its maximum, under a 3px ink
 * rule. A number that is there, not one that counts up (docs/04 §5).
 */
export function ScoreFigure({ points, maxPoints, caption }: ScoreFigureProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t-[3px] border-ink-1 pt-4">
      <p
        data-testid="results-total"
        className="motion-settle tabular font-mono text-score leading-none font-bold text-ink-1"
      >
        {formatPoints(points)}
        <span className="text-2xl font-medium text-ink-2">/{formatPoints(maxPoints)}</span>
      </p>
      <span className="text-ink-2">{caption}</span>
    </div>
  );
}
