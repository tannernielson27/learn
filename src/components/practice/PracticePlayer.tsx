"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CaseStudyPlayer, type InitialStep } from "@/components/case-study/CaseStudyPlayer";
import { ActionBar } from "@/components/question/ActionBar";
import { SetNav } from "@/components/question/SetNav";
import type { PractiseMissedState } from "@/components/review/PractiseMissed";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { ProgressBar } from "@/components/ui/ProgressBar";
// Module by module, never a barrel: this is a screen a student loads, and the scoring engine must
// not reach its bundle (ADR 0003, `noClientScoring.test.ts`). Types from server modules only.
import { PracticeAnswerError, postPracticeAnswer } from "@/lib/practice/answerClient";
import {
  itemsOf,
  type PracticeAnswered,
  type PracticeEntry,
  type PracticeView,
} from "@/lib/practice/entries";
import { PRACTICE_REFUSALS } from "@/lib/practice/refusals";
import { rowsFromPractice } from "@/lib/practice/resultsRows";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { KeylessItem, ScoreReveal } from "@/lib/ngn/submit";
import { PracticeItem } from "./PracticeItem";
import { PracticeResults } from "./PracticeResults";
import { PracticeStartOver, type StartOverState } from "./PracticeStartOver";

export type PracticeAnswerHandler = (
  runId: string,
  itemId: string,
  response: AnyResponse,
) => Promise<ScoreReveal>;

export interface PracticePlayerProps {
  view: PracticeView;
  /** The Server Action that opens a new run, already bound to the bank. A missed run has none. */
  startOver?: (previous: StartOverState) => Promise<StartOverState>;
  /** "Practise the N I missed", bound to this run on the server (owner decision 6). */
  practiseMissed?: (previous: PractiseMissedState) => Promise<PractiseMissedState>;
  /** Where a run of missed questions goes back to once it is done. */
  back?: { href: string; label: string };
  /** Checks one answer. Defaults to `POST /api/practice/answer`; injected by tests. */
  answer?: PracticeAnswerHandler;
}

type Done = Readonly<Record<string, PracticeAnswered>>;

function serverDone(entries: readonly PracticeEntry[]): Done {
  return Object.fromEntries(
    entries
      .flatMap(itemsOf)
      .flatMap((entry) => (entry.answered ? [[entry.itemId, entry.answered]] : [])),
  );
}

function initialStep(done: PracticeAnswered | undefined): InitialStep | undefined {
  if (!done) return undefined;
  return done.kind === "scored"
    ? { response: done.response, reveal: done.reveal }
    : { keyOnly: done.key };
}

/**
 * The refusals that mean the screen is out of date: the share stopped, or the item was answered in
 * another tab. The page is read again, which either 404s or brings the item back answered.
 */
const REREAD = new Set(["not_found", "answered"]);

/** Never settles: the refreshed page replaces the player, so it must not report a failure first. */
const pending = (): Promise<never> => new Promise<never>(() => {});

/**
 * A student practising a shared quiz (#241; PracticeCase and PracticePhone): one entry at a time —
 * an item, or a case study played step by step — with "n of N done" and a progress bar, a list to
 * jump between them, Previous and Next, and Start over. Once every question has an answer the run
 * ends on its results (ResultsPhone): the total, the share by step, what was missed, "Practise the
 * N I missed" and "Start over with all N"; any question there opens again in the player.
 *
 * Each item is the shared `ItemPlayer` with its own Submit. The submit goes to the server, which
 * scores it, records it, and only then sends back that one item's key, rationale, scoring rule and
 * score; the player turns to feedback with them, and Previous and "Next question" take Submit's
 * place in the bar. A case study is the shared `CaseStudyPlayer`, whose steps submit the same way
 * one at a time (#46), so each step's key arrives with that step's answer and no sooner. This
 * screen holds no key for anything the student has not answered, and no scoring code (ADR 0003).
 *
 * What is answered is the server's view (`view.entries`, fresh on every reload or refresh) merged
 * with the answers this tab has just been handed back. A refusal that means the screen is out of
 * date reads the page again and says why, once; any other failure is the player's own "could not
 * be checked" beside its Submit.
 */
export function PracticePlayer({
  view,
  startOver,
  practiseMissed,
  back,
  answer = postPracticeAnswer,
}: PracticePlayerProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // Answers checked in this tab. The server's own list is merged in on every render, so a refresh
  // that brings back an item answered elsewhere closes it here too.
  const [checked, setChecked] = useState<Done>({});
  const [drafts, setDrafts] = useState<Readonly<Record<string, AnyResponse>>>({});
  const [notice, setNotice] = useState<string | null>(null);
  // The results page is open: at once for a run already finished when it was opened, and only
  // on "See results" for one finished here, so the last answer's own marks and rationale show
  // first (code review, 2026-10-22). A question picked from the results closes it again.
  const [resultsOpen, setResultsOpen] = useState(
    () => view.total > 0 && Object.keys(serverDone(view.entries)).length >= view.total,
  );

  if (view.entries.length === 0) {
    return <p className="measure text-ink-2">This quiz has no questions yet.</p>;
  }

  const fromServer = serverDone(view.entries);
  const done: Done = { ...fromServer, ...checked };
  const at = Math.min(index, view.entries.length - 1);
  const entry = view.entries[at] as PracticeEntry;
  const answered = Object.keys(done).length;
  const finished = view.total > 0 && answered >= view.total;
  const isLast = at === view.entries.length - 1;

  const check = async (itemId: string, response: AnyResponse): Promise<ScoreReveal> => {
    setNotice(null);
    try {
      const reveal = await answer(view.runId, itemId, response);
      setChecked((held) => ({ ...held, [itemId]: { kind: "scored", response, reveal } }));
      return reveal;
    } catch (error) {
      const refusal = error instanceof PracticeAnswerError ? error.refusal : "failed";
      if (!REREAD.has(refusal)) throw error;
      setNotice(PRACTICE_REFUSALS[refusal]);
      router.refresh();
      return pending();
    }
  };

  if (finished && resultsOpen) {
    const rows = rowsFromPractice(view.entries, done);
    return (
      <PracticeResults
        rows={rows}
        kind={view.kind ?? "quiz"}
        startOver={startOver}
        practiseMissed={practiseMissed}
        back={back}
        onReview={(itemId) => {
          const to = view.entries.findIndex((each) =>
            itemsOf(each).some((step) => step.itemId === itemId),
          );
          setIndex(Math.max(0, to));
          setResultsOpen(false);
        }}
      />
    );
  }

  // A step's row id by the step's own item id, which is unique within its case study.
  const rowOf = new Map<string, string>(
    entry.kind === "case_study" ? entry.steps.map((step) => [step.item.id, step.itemId]) : [],
  );
  // #335: the next step and its chart are not on this page until the server has the answer to this
  // one, so a checked step reads the page again. A refresh keeps the player and where it is.
  const submitStep = (item: KeylessItem) => async (response: AnyResponse) => {
    const row = rowOf.get(item.id);
    if (row === undefined) throw new Error("unknown step");
    const reveal = await check(row, response);
    router.refresh();
    return reveal;
  };

  const standaloneDone = entry.kind === "item" && done[entry.itemId] !== undefined;
  const toResults = () => {
    setResultsOpen(true);
    setIndex(0);
  };

  // A question on its own reads at the question's measure; beside a patient record it takes the
  // room the record layout needs for its two panes (PracticeCase).
  const withRecord = entry.kind === "case_study" || entry.record !== undefined;

  return (
    <div className={withRecord ? undefined : "mx-auto max-w-190"}>
      <div className="flex items-center gap-4">
        <p
          data-testid="practice-count"
          className="tabular shrink-0 font-mono text-sm font-semibold"
        >
          {`${answered} of ${view.total} done`}
        </p>
        <ProgressBar
          className="flex-1"
          value={answered}
          max={view.total}
          label="Questions answered"
          valueText={`${answered} of ${view.total} done`}
        />
      </div>

      <SetNav
        entries={view.entries.map((each) => ({
          key: each.kind === "item" ? each.itemId : each.id,
          answered: itemsOf(each).every((step) => done[step.itemId] !== undefined),
        }))}
        current={at}
        onSelect={setIndex}
      />

      {notice ? (
        <Notice role="alert" className="measure mt-4">
          {notice}
        </Notice>
      ) : null}

      <div className="mt-8">
        {entry.kind === "item" ? (
          <PracticeItem
            // Remounted when the item becomes answered, since ItemPlayer reads its props once.
            key={`${view.runId}:${entry.itemId}:${done[entry.itemId]?.kind ?? "open"}`}
            entry={entry}
            done={done[entry.itemId]}
            draft={drafts[entry.itemId]}
            onDraft={(response) => setDrafts((held) => ({ ...held, [entry.itemId]: response }))}
            check={(response) => check(entry.itemId, response)}
          />
        ) : (
          <section aria-labelledby={`case-${entry.id}`}>
            <h2 id={`case-${entry.id}`} className="mb-4 font-read text-2xl break-words text-ink-1">
              {entry.title}
            </h2>
            <CaseStudyPlayer
              // Not remounted when a refresh brings a step: it takes the reached steps as they
              // grow, and reads a step answered elsewhere from `initialSteps` (#335).
              key={`${view.runId}:${entry.id}`}
              caseStudy={{
                id: entry.id,
                title: entry.title,
                tags: [],
                items: entry.steps.map((step) => step.item),
              }}
              records={entry.records}
              stepCount={entry.stepCount}
              onReloadNext={() => router.refresh()}
              initialSteps={entry.steps.map((step) => initialStep(done[step.itemId]))}
              submitFor={submitStep}
            />
          </section>
        )}
      </div>

      {standaloneDone ? (
        // Answered: Previous and the way on take Submit's place (PracticePhone).
        <ActionBar>
          <Button variant="ghost" disabled={at === 0} onClick={() => setIndex(at - 1)}>
            Previous
          </Button>
          {finished ? (
            <Button variant="primary" size="lg" className="flex-1 md:flex-none" onClick={toResults}>
              See results
            </Button>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="flex-1 md:flex-none"
              disabled={isLast}
              onClick={() => setIndex(at + 1)}
            >
              Next question
            </Button>
          )}
        </ActionBar>
      ) : (
        <div className="mt-6 flex flex-wrap justify-between gap-2">
          <Button variant="secondary" disabled={at === 0} onClick={() => setIndex(at - 1)}>
            Previous
          </Button>
          <Button variant="secondary" disabled={isLast} onClick={() => setIndex(at + 1)}>
            Next
          </Button>
        </div>
      )}

      {finished ? (
        <p className="mt-6">
          <Button variant="ghost" onClick={toResults}>
            Back to your results
          </Button>
        </p>
      ) : startOver ? (
        <PracticeStartOver startOver={startOver} />
      ) : null}
      {/* Room for the phone's fixed bar, which the last thing on the page must clear. */}
      {/* Answered or not: an open question's Submit bar is fixed there too, over Start over. */}
      <div aria-hidden="true" className="h-28 md:hidden" />
    </div>
  );
}
