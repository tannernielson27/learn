import type { StepShare } from "@/lib/assignments/resultsSummary";

export interface StepBarsProps {
  steps: readonly StepShare[];
  /** The heading over the bars; its level is the page's to choose. */
  heading?: string;
  headingLevel?: "h2" | "h3";
  className?: string;
}

/**
 * The share earned at each clinical judgment step, one neutral bar per step (ResultsDesktop): the
 * chart's one hue, the step's name and the percent in words. No step is coloured right or wrong;
 * the number says how it went. Bars grow once from the left (`motion-grow`).
 */
export function StepBars({
  steps,
  heading = "By clinical judgment step",
  headingLevel: Heading = "h2",
  className = "",
}: StepBarsProps) {
  if (steps.length === 0) return null;
  return (
    <section aria-label={heading} className={`flex flex-col gap-3 ${className}`.trim()}>
      <Heading className="text-base font-bold text-ink-1">{heading}</Heading>
      <ul className="flex flex-col gap-3">
        {steps.map((step) => (
          <li
            key={step.step}
            className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[11rem_minmax(0,1fr)_3rem]"
          >
            <span className="col-span-2 sm:col-span-1">
              <span className="sr-only">{`Step ${step.step}: `}</span>
              {step.label}
            </span>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-chart-track">
              <span
                className="motion-grow block h-full origin-left rounded-full bg-chart-bar"
                style={{ transform: `scaleX(${step.percent / 100})` }}
              />
            </div>
            <span className="tabular text-right font-mono">{`${step.percent}%`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
