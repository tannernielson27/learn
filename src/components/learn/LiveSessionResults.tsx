"use client";

import { useEffect, useId, useRef, useState } from "react";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import { ShowFeedbackWords } from "@/components/question/FeedbackWords";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import {
  QuestionResults,
  filterRows,
  type ResultsFilter,
} from "@/components/review/QuestionResults";
import { ScoreFigure } from "@/components/review/ScoreFigure";
import { StepBars } from "@/components/review/StepBars";
import { Button } from "@/components/ui/Button";
import {
  formatPoints,
  rowOf,
  stepShares,
  totalsOf,
  type ResultRow,
} from "@/lib/assignments/resultsSummary";
// Types only from the server loader: this is a screen a student loads, and the scoring engine
// must not reach its bundle (ADR 0003). The marks were computed on the server when they answered.
import type { LiveResultEntry } from "@/lib/learn/liveResultPage";
import type { Reveal, ScoreReveal } from "@/lib/ngn/submit";

export interface LiveSessionResultsProps {
  /** The questions the session reached, in order, keys included: the session has ended. */
  entries: readonly LiveResultEntry[];
}

/** A results page has nothing to send: every question is shown already marked, read-only. */
const nothingToSend = (): Promise<ScoreReveal> =>
  Promise.reject(new Error("This live session has ended."));

const NOTES: Record<Exclude<LiveResultEntry["outcome"]["kind"], "answered">, string> = {
  not_attempted: "You did not answer this.",
  not_answered: "You did not answer this.",
  unmarked: "Not marked yet.",
  unreadable: "Your answer could not be shown.",
};

function rowsOf(entries: readonly LiveResultEntry[]): ResultRow[] {
  return entries.map(({ rowId, position, item, outcome }) =>
    rowOf(
      rowId,
      position,
      item,
      outcome.kind === "answered"
        ? { points: outcome.score.points, maxPoints: outcome.score.maxPoints }
        : outcome.kind === "unreadable"
          ? "unreadable"
          : "unanswered",
    ),
  );
}

function Total({ entries, rows }: { entries: readonly LiveResultEntry[]; rows: ResultRow[] }) {
  const totals = totalsOf(rows);
  const answered = entries.filter((entry) => entry.outcome.kind === "answered").length;
  const noun = entries.length === 1 ? "question" : "questions";
  return (
    <section aria-labelledby="live-results-total-heading" className="flex flex-col gap-2">
      <h2 id="live-results-total-heading" className="eyebrow">
        Your score
      </h2>
      <ScoreFigure
        points={totals.points}
        maxPoints={totals.maxPoints}
        caption={`points · ${totals.percent}%`}
      />
      <p className="text-sm text-ink-2">{`Answered ${answered} of ${entries.length} ${noun}.`}</p>
    </section>
  );
}

const keyOf = (entry: LiveResultEntry): Reveal => ({
  answerKey: entry.item.answerKey,
  rationale: entry.item.rationale,
  scoring: entry.item.scoring,
});

/** One question in the review view: their answer marked against the key, or the key alone. */
function ResultItem({ entry }: { entry: LiveResultEntry }) {
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
 * A student's own results for one ended live session, laid out as an assignment's results
 * (ResultsDesktop and ResultsPhone): their total, "Review what I missed", the share by clinical
 * judgment step, and each question the session reached with its verdict, All or Missed. Below the
 * list the question picked is shown in the review view the phone showed at the reveal: their
 * answer marked against the key with the rationale, or for a question they left blank the key alone
 * with a line saying so. Right and wrong are marked in words as well as colour. One question at a
 * time, with Previous and Next, so a phone at 375px shows one question and its rationale. A step of
 * a case study has its patient record beside it, cut to that step as the phone had it.
 */
export function LiveSessionResults({ entries }: LiveSessionResultsProps) {
  const rows = rowsOf(entries);
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
    return <p className="measure mt-6 text-ink-2">This live session has no questions to show.</p>;
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
        <Total entries={entries} rows={rows} />
        {missed > 0 ? (
          <Button variant="secondary" block onClick={reviewMissed}>
            Review what I missed
          </Button>
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
              {entry?.record ? <RecordLayout record={entry.record}>{review}</RecordLayout> : review}
            </ShowFeedbackWords>
          </section>
        ) : null}
      </section>
    </div>
  );
}
