"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import { ShowFeedbackWords } from "@/components/question/FeedbackWords";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import {
  PRACTICE_NEVER_GRADED,
  PractiseMissed,
  type PractiseMissedState,
} from "@/components/review/PractiseMissed";
import {
  QuestionResults,
  filterRows,
  type ResultsFilter,
} from "@/components/review/QuestionResults";
import { ScoreFigure } from "@/components/review/ScoreFigure";
import { StepBars } from "@/components/review/StepBars";
import { Button } from "@/components/ui/Button";
// Types only from the server modules: this is a screen a student loads, and the scoring engine
// must not reach its bundle (ADR 0003). The marks were computed on the server at submit.
import type { BestResult, ResultEntry, ResultOutcome } from "@/lib/assignments/results";
import { rowsFromResults } from "@/lib/assignments/resultsRows";
import { formatPoints, stepShares, totalsOf } from "@/lib/assignments/resultsSummary";
import type { EhrRecord } from "@/lib/ngn/schemas";
import type { Reveal, ScoreReveal } from "@/lib/ngn/submit";

export interface AssignmentResultsProps {
  best: BestResult | null;
  attemptsMade: number;
  entries: readonly ResultEntry[];
  /** The case study's patient record snapshot; null for a quiz. */
  record: EhrRecord | null;
  /**
   * "Practise the N I missed", bound to the assignment on the server (owner decision 6). Absent
   * where practice cannot start, as in the gallery.
   */
  practiseMissed?: (previous: PractiseMissedState) => Promise<PractiseMissedState>;
}

/** A results page has nothing to send: every item is shown already marked, read-only. */
const nothingToSend = (): Promise<ScoreReveal> =>
  Promise.reject(new Error("This assignment has closed."));

const NOTES: Record<Exclude<ResultOutcome["kind"], "answered">, string> = {
  not_attempted: "You did not attempt this.",
  not_answered: "You did not answer this.",
  unmarked: "Not marked yet.",
  unreadable: "Your answer could not be shown.",
};

/** What the total needs said beside it. One attempt needs nothing: the score is that attempt's. */
function totalLine(best: BestResult | null, attemptsMade: number): string | null {
  if (attemptsMade === 0) return "You did not attempt this assignment.";
  if (best === null) return "Not marked yet. Reload the page in a moment.";
  return attemptsMade === 1 ? null : `Your best: attempt ${best.attemptNumber} of ${attemptsMade}.`;
}

const percentOf = (best: BestResult) =>
  best.maxScore > 0 ? Math.round((best.score / best.maxScore) * 100) : 0;

function Total({ best, attemptsMade }: Pick<AssignmentResultsProps, "best" | "attemptsMade">) {
  const line = totalLine(best, attemptsMade);
  return (
    <section aria-labelledby="results-total-heading" className="flex flex-col gap-2">
      <h2 id="results-total-heading" className="eyebrow">
        Your score
      </h2>
      {best ? (
        <ScoreFigure
          points={best.score}
          maxPoints={best.maxScore}
          caption={`points · ${percentOf(best)}%`}
        />
      ) : null}
      {line ? <p className="text-sm text-ink-2">{line}</p> : null}
    </section>
  );
}

const keyOf = (entry: ResultEntry): Reveal => ({
  answerKey: entry.item.answerKey,
  rationale: entry.item.rationale,
  scoring: entry.item.scoring,
});

/** One item in the review view: the student's answer marked against the key, or the key alone. */
function ResultItem({ entry }: { entry: ResultEntry }) {
  const { outcome } = entry;
  if (outcome.kind === "answered") {
    return (
      <ItemPlayer
        key={`${entry.rowId}:answer`}
        item={entry.item}
        initialResponse={outcome.response}
        initialReveal={{ ...keyOf(entry), score: outcome.score }}
        submit={nothingToSend}
        label="Your answer"
      />
    );
  }
  return (
    <>
      <p data-testid="result-note" className="measure mb-4 text-sm text-ink-2">
        {NOTES[outcome.kind]}
      </p>
      <ItemPlayer
        key={`${entry.rowId}:key`}
        item={entry.item}
        initialKey={keyOf(entry)}
        submit={nothingToSend}
        label="Answer key"
      />
    </>
  );
}

/**
 * A student's results once the assignment has closed (#210; ResultsDesktop and ResultsPhone): the
 * best attempt's total, "Practise the N I missed" and "Review what I missed", the share by
 * clinical judgment step, and the questions with their verdicts, All or Missed. Below the list the
 * question picked is shown in the same review view a live session's phone shows at the reveal
 * (#181): the student's answer marked against the key by its own renderer, with the rationale, or
 * for an item they did not answer the key alone with a line saying so. Right and wrong are marked
 * in words as well as colour.
 *
 * One question at a time with Previous and Next through the list as filtered, so a phone at 375px
 * shows one question and its rationale rather than a wall of them. A case study's patient record
 * sits beside the steps, as it did while they were answered.
 */
export function AssignmentResults({
  best,
  attemptsMade,
  entries,
  record,
  practiseMissed,
}: AssignmentResultsProps) {
  const rows = rowsFromResults(entries);
  const [filter, setFilter] = useState<ResultsFilter>("all");
  const [currentId, setCurrentId] = useState<string | undefined>(rows[0]?.id);
  const reviewRef = useRef<HTMLElement>(null);
  const follow = useRef(false);
  const listHeading = useId();

  const shown = filterRows(rows, filter);
  const at = Math.max(
    0,
    shown.findIndex((row) => row.id === currentId),
  );
  const current = shown[at];
  const entry = entries.find((each) => each.rowId === current?.id);
  const missed = totalsOf(rows).missed;

  // A pick in the list or "Review what I missed" moves focus to the question it opened.
  useEffect(() => {
    if (!follow.current) return;
    follow.current = false;
    reviewRef.current?.focus();
  }, [currentId, filter]);

  const open = (id: string | undefined) => {
    follow.current = true;
    setCurrentId(id);
  };

  const reviewMissed = () => {
    follow.current = true;
    setFilter("missed");
    setCurrentId(filterRows(rows, "missed")[0]?.id);
  };

  const changeFilter = (next: ResultsFilter) => {
    setFilter(next);
    const inView = filterRows(rows, next);
    if (!inView.some((row) => row.id === currentId)) setCurrentId(inView[0]?.id);
  };

  if (entries.length === 0) {
    return (
      <div className="mt-6">
        <Total best={best} attemptsMade={attemptsMade} />
        <p className="measure mt-6 text-ink-2">This assignment has no questions.</p>
      </div>
    );
  }

  const review = entry ? (
    <>
      <ResultItem key={entry.rowId} entry={entry} />
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        <Button variant="secondary" disabled={at === 0} onClick={() => open(shown[at - 1]?.id)}>
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={at >= shown.length - 1}
          onClick={() => open(shown[at + 1]?.id)}
        >
          Next
        </Button>
      </div>
    </>
  ) : null;

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[23.75rem_minmax(0,1fr)] lg:gap-12">
      <div className="flex flex-col gap-6">
        <Total best={best} attemptsMade={attemptsMade} />
        {missed > 0 ? (
          <div className="flex flex-col gap-2.5">
            {practiseMissed ? <PractiseMissed missed={missed} action={practiseMissed} /> : null}
            <Button variant="secondary" block onClick={reviewMissed}>
              Review what I missed
            </Button>
            {practiseMissed ? <p className="text-sm text-ink-2">{PRACTICE_NEVER_GRADED}</p> : null}
          </div>
        ) : null}
        <StepBars steps={stepShares(rows)} />
      </div>

      <section aria-labelledby={listHeading} className="flex min-w-0 flex-col">
        <QuestionResults
          rows={rows}
          filter={filter}
          onFilter={changeFilter}
          currentId={current?.id}
          onSelect={open}
          headingId={listHeading}
        />
        {current ? (
          <section
            ref={reviewRef}
            tabIndex={-1}
            aria-label={`Question ${current.number}`}
            className="mt-8"
          >
            <p className="eyebrow mb-4">
              {`Question ${current.number} · ${formatPoints(current.points ?? 0)}/${formatPoints(current.maxPoints)}`}
            </p>
            <ShowFeedbackWords>
              {record ? <RecordLayout record={record}>{review}</RecordLayout> : review}
            </ShowFeedbackWords>
          </section>
        ) : null}
      </section>
    </div>
  );
}
