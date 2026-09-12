import { CJMM_STEP_LABELS, type CjmmStep } from "@/lib/ngn/types";

export interface StepIndicatorProps {
  /** 1-based step the student is on; 7 once they have reached the results. */
  step: number;
  total: number;
}

/**
 * Where the student is in the clinical judgment flow. Six marks rather than one sliding bar,
 * because the six steps are the thing being taught: the student should see them as six.
 */
export function StepIndicator({ step, total }: StepIndicatorProps) {
  const onResults = step > total;
  return (
    <div>
      {/* Not a live region: each step change moves focus to the step, whose name says this. */}
      <p className="text-sm font-medium" data-step-indicator={onResults ? "results" : step}>
        {onResults ? "Results" : `Step ${step} of ${total}: ${CJMM_STEP_LABELS[step as CjmmStep]}`}
      </p>
      <ol aria-hidden="true" className="mt-2 flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-base ease-out-expo ${
              i < step ? "bg-accent" : "bg-surface-2"
            }`}
          />
        ))}
      </ol>
    </div>
  );
}
