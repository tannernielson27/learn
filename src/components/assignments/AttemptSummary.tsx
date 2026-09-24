import type { AttemptSummary as Attempt } from "@/lib/supabase/attempts";
import { LocalTime } from "./LocalTime";

export interface AttemptSummaryProps {
  attempts: readonly Attempt[];
  closed: boolean;
}

/**
 * A student's attempts at one assignment, as they may know them before results (#208): which were
 * submitted, when, and whether at close. Never a score: until #210 shows results at close, the
 * page says "Submitted" and nothing about right or wrong, and the rows it reads have no score.
 */
export function AttemptSummary({ attempts, closed }: AttemptSummaryProps) {
  if (attempts.length === 0) {
    return (
      <p className="measure mt-6 text-ink-2">
        {closed ? "You did not start this assignment." : "You have not started this assignment."}
      </p>
    );
  }
  return (
    <ul
      aria-label="Your attempts"
      className="mt-6 flex flex-col divide-y divide-line border-y border-line"
    >
      {attempts.map((attempt) => (
        <li key={attempt.id} className="flex flex-col gap-1 px-2 py-3">
          <span className="font-medium text-ink-1">{`Attempt ${attempt.number}`}</span>
          {attempt.submittedAt ? (
            <span className="text-sm text-ink-2" data-testid="attempt-submitted">
              {attempt.autoSubmitted ? "Submitted at close " : "Submitted "}
              <LocalTime iso={attempt.submittedAt} />
            </span>
          ) : (
            <span className="text-sm text-ink-2">Being submitted</span>
          )}
        </li>
      ))}
    </ul>
  );
}
