"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { PractiseMissed, type PractiseMissedState } from "@/components/review/PractiseMissed";
import { QuestionResults, type ResultsFilter } from "@/components/review/QuestionResults";
import { ScoreFigure } from "@/components/review/ScoreFigure";
import { StepBars } from "@/components/review/StepBars";
import { buttonClasses } from "@/components/ui/Button";
import { stepShares, totalsOf, type ResultRow } from "@/lib/assignments/resultsSummary";
import { PracticeStartOver, type StartOverState } from "./PracticeStartOver";

export interface PracticeResultsProps {
  rows: readonly ResultRow[];
  /** `missed` for a run of only the questions missed before: it has no Start over of its own. */
  kind: "quiz" | "missed";
  /** Opens one question again in the player. */
  onReview: (id: string) => void;
  startOver?: (previous: StartOverState) => Promise<StartOverState>;
  practiseMissed?: (previous: PractiseMissedState) => Promise<PractiseMissedState>;
  /** Where a run of missed questions goes back to: the results it came from, or the classes. */
  back?: { href: string; label: string };
}

/**
 * The end of a practice run (ResultsPhone): the total, the share by clinical judgment step, the
 * questions with their verdicts (Missed first, since that is what is left to do), "Practise the N
 * I missed" and "Start over with all N". Practice is never graded, so none of it is a grade.
 */
export function PracticeResults({
  rows,
  kind,
  onReview,
  startOver,
  practiseMissed,
  back,
}: PracticeResultsProps) {
  const totals = totalsOf(rows);
  const [filter, setFilter] = useState<ResultsFilter>(totals.missed > 0 ? "missed" : "all");
  const headingId = useId();
  return (
    <section aria-label="Practice finished" className="flex flex-col gap-8 pb-40 md:pb-0">
      <div className="grid gap-8 lg:grid-cols-[23.75rem_minmax(0,1fr)] lg:gap-12">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="eyebrow">Practice finished</p>
            <ScoreFigure
              points={totals.points}
              maxPoints={totals.maxPoints}
              caption={totals.missed === 0 ? "all correct" : `points · ${totals.percent}%`}
            />
          </div>
          <div className="flex flex-col gap-2.5">
            {practiseMissed ? (
              <PractiseMissed missed={totals.missed} action={practiseMissed} />
            ) : null}
            {kind === "quiz" && startOver ? (
              <PracticeStartOver
                startOver={startOver}
                label={`Start over with all ${rows.length}`}
              />
            ) : null}
            {back ? (
              <Link
                href={back.href}
                className={buttonClasses({ variant: "secondary", block: true })}
              >
                {back.label}
              </Link>
            ) : null}
          </div>
          <StepBars steps={stepShares(rows)} />
        </div>
        <section aria-labelledby={headingId} className="min-w-0">
          <QuestionResults
            rows={rows}
            filter={filter}
            onFilter={setFilter}
            onSelect={onReview}
            headingId={headingId}
          />
        </section>
      </div>
    </section>
  );
}
