import { StepBars } from "@/components/review/StepBars";
import type { StepShare } from "@/lib/assignments/resultsSummary";
import type { StepRow } from "@/lib/live/report";

/** The report's step rows as bars: the same rounded percent the table beside them prints. */
export function reportStepShares(steps: readonly StepRow[]): StepShare[] {
  return steps.flatMap((step) =>
    step.meanPercent === null
      ? []
      : [
          {
            step: step.step,
            label: step.label,
            percent: Math.round(step.meanPercent),
            questions: step.itemCount,
          },
        ],
  );
}

/**
 * The class's mean by clinical judgment step at a glance, above the table that holds the exact
 * figures: one neutral bar per step, in the results chart's hue, so no step reads as red or green.
 * A step nobody answered has no bar; the table says "–" for it.
 */
export function ReportStepBars({ steps }: { steps: readonly StepRow[] }) {
  return (
    <StepBars
      steps={reportStepShares(steps)}
      heading="Mean by clinical judgment step"
      className="mb-6 max-w-reading rounded-md border border-line bg-surface-1 p-4 sm:p-6"
    />
  );
}
