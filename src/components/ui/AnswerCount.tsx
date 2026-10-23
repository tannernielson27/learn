export interface AnswerCountProps {
  answered: number;
  /** How many could answer: everyone who has joined. */
  total: number;
  /** `app` for the console; `stage` for the projector, the number in the stage ladder. */
  size?: "app" | "stage";
  className?: string;
}

const SIZES = {
  app: { number: "text-2xl", rest: "text-base" },
  stage: { number: "text-stage-number", rest: "text-stage-label" },
} as const;

/**
 * "18 of 24 answered": a count, never who (owner decision 4). The number is mono and large, the
 * words beside it are not, and the whole reads as one sentence.
 */
export function AnswerCount({ answered, total, size = "app", className = "" }: AnswerCountProps) {
  const look = SIZES[size];
  const shown = Math.max(0, answered);
  return (
    <p
      data-testid="answer-count"
      className={`flex flex-wrap items-baseline gap-x-2 ${className}`.trim()}
    >
      <span className={`${look.number} font-mono leading-none font-bold tabular`}>{shown}</span>{" "}
      <span className={`${look.rest} text-ink-2`}>
        of <span className="font-mono font-semibold text-ink-1 tabular">{total}</span> answered
      </span>
    </p>
  );
}
