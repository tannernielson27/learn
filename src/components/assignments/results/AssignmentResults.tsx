"use client";

import { useState } from "react";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { SetNav } from "@/components/question/SetNav";
import { Button } from "@/components/ui/Button";
// Types only from the server modules: this is a screen a student loads, and the scoring engine
// must not reach its bundle (ADR 0003). The marks were computed on the server at submit.
import type { BestResult, ResultEntry, ResultOutcome } from "@/lib/assignments/results";
import type { EhrRecord } from "@/lib/ngn/schemas";
import type { Reveal, ScoreReveal } from "@/lib/ngn/submit";

export interface AssignmentResultsProps {
  best: BestResult | null;
  attemptsMade: number;
  entries: readonly ResultEntry[];
  /** The case study's patient record snapshot; null for a bank. */
  record: EhrRecord | null;
}

/** A results page has nothing to send: every item is shown already marked, read-only. */
const nothingToSend = (): Promise<ScoreReveal> =>
  Promise.reject(new Error("This assignment has closed."));

/** Two decimals at most, as the database stores them, without trailing zeros. */
const points = (value: number): string => String(Math.round(value * 100) / 100);

const NOTES: Record<Exclude<ResultOutcome["kind"], "answered">, string> = {
  not_attempted: "You did not attempt this.",
  not_answered: "You did not answer this.",
  unmarked: "Your attempt has not been marked yet.",
  unreadable: "Your answer to this could not be shown.",
};

function totalLine(best: BestResult | null, attemptsMade: number): string {
  if (attemptsMade === 0) return "You did not attempt this assignment.";
  if (best === null) return "Your attempt has not been marked yet. Reload the page in a moment.";
  return attemptsMade === 1
    ? "From your one attempt."
    : `Your best attempt counts: attempt ${best.attemptNumber} of ${attemptsMade}.`;
}

function Total({ best, attemptsMade }: Pick<AssignmentResultsProps, "best" | "attemptsMade">) {
  return (
    <section
      aria-labelledby="results-total-heading"
      className="mt-6 rounded-md border border-line bg-surface-1 p-5"
    >
      <h2 id="results-total-heading" className="eyebrow">
        Your score
      </h2>
      {best ? (
        <p data-testid="results-total" className="tabular mt-2 font-mono text-3xl text-ink-1">
          {`${points(best.score)} of ${points(best.maxScore)}`}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-ink-2">{totalLine(best, attemptsMade)}</p>
    </section>
  );
}

const keyOf = (entry: ResultEntry): Reveal => ({
  answerKey: entry.item.answerKey,
  rationale: entry.item.rationale,
  scoring: entry.item.scoring,
});

/** One item in the review view: the student's answer marked against the key, or the key alone. */
function ResultItem({ entry, index, total }: { entry: ResultEntry; index: number; total: number }) {
  const progress = { index, total };
  const { outcome } = entry;
  if (outcome.kind === "answered") {
    return (
      <ItemPlayer
        key={`${entry.rowId}:answer`}
        item={entry.item}
        initialResponse={outcome.response}
        initialReveal={{ ...keyOf(entry), score: outcome.score }}
        progress={progress}
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
        progress={progress}
        submit={nothingToSend}
        label="Answer key"
      />
    </>
  );
}

/**
 * A student's results once the assignment has closed (#210): the best attempt's total, then each
 * item in the same review view a live session's phone shows at the reveal (#181) — the student's
 * answer marked against the key by the item's own renderer, the per-element rationale inline and
 * `rationale.general` beneath — or, for an item they did not answer, the key alone with a line
 * saying so. Right and wrong are marked in words ("Correct", "Incorrect", "Missed") as well as
 * colour, by the renderers themselves.
 *
 * One item at a time, with the same numbered list and Previous and Next as taking it (#208), so a
 * phone at 375px shows one question and its rationale rather than a wall of them. A case study's
 * patient record sits beside the steps, as it did while they were answered.
 */
export function AssignmentResults({ best, attemptsMade, entries, record }: AssignmentResultsProps) {
  const [index, setIndex] = useState(0);

  if (entries.length === 0) {
    return (
      <>
        <Total best={best} attemptsMade={attemptsMade} />
        <p className="measure mt-6 text-ink-2">This assignment has no items to show.</p>
      </>
    );
  }

  const at = Math.min(index, entries.length - 1);
  const entry = entries[at] as ResultEntry;
  const review = (
    <>
      <SetNav
        entries={entries.map((each) => ({
          key: each.rowId,
          answered: each.outcome.kind === "answered" || each.outcome.kind === "unreadable",
        }))}
        current={at}
        onSelect={setIndex}
      />
      <div className="mt-8">
        <ResultItem key={entry.rowId} entry={entry} index={at} total={entries.length} />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2">
        <Button variant="secondary" disabled={at === 0} onClick={() => setIndex(at - 1)}>
          Previous item
        </Button>
        <Button
          variant="secondary"
          disabled={at === entries.length - 1}
          onClick={() => setIndex(at + 1)}
        >
          Next item
        </Button>
      </div>
    </>
  );

  return (
    <>
      <Total best={best} attemptsMade={attemptsMade} />
      <div className="mt-6">
        {record ? <RecordLayout record={record}>{review}</RecordLayout> : review}
      </div>
    </>
  );
}
