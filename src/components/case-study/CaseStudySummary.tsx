import { totalScore } from "@/lib/ngn/scoring";
import { CJMM_STEP_LABELS, type CjmmStep, type ScoreResult } from "@/lib/ngn/types";

export interface CaseStudySummaryProps {
  /** One result per step, in step order. */
  results: readonly ScoreResult[];
}

/**
 * What the case study came to: the total, then the six steps behind it. Per-step scores are what
 * make this worth reading — they say which part of clinical judgment let the student down.
 */
export function CaseStudySummary({ results }: CaseStudySummaryProps) {
  const total = totalScore(results);
  return (
    <section aria-label="Case study results" className="rounded-md border border-line p-5 sm:p-6">
      <p className="eyebrow">Total</p>
      <p className="motion-settle tabular mt-1 font-mono text-2xl">
        {total.points} of {total.maxPoints} points
      </p>
      <ol className="mt-6 flex flex-col">
        {results.map((result, index) => {
          const step = (index + 1) as CjmmStep;
          return (
            <li
              key={step}
              className="flex items-baseline justify-between gap-4 border-t border-line py-3"
            >
              <span className="text-sm">
                Step {step}: {CJMM_STEP_LABELS[step]}
              </span>
              <span className="tabular shrink-0 font-mono text-sm text-ink-2">
                {result.points} / {result.maxPoints}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
