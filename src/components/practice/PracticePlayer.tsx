"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CaseStudyPlayer, type InitialStep } from "@/components/case-study/CaseStudyPlayer";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { SetNav } from "@/components/question/SetNav";
import { Button } from "@/components/ui/Button";
// Module by module, never a barrel: this is a screen a student loads, and the scoring engine must
// not reach its bundle (ADR 0003, `noClientScoring.test.ts`). Types from server modules only.
import { PracticeAnswerError, postPracticeAnswer } from "@/lib/practice/answerClient";
import {
  itemsOf,
  type PracticeAnswered,
  type PracticeEntry,
  type PracticeItemEntry,
  type PracticeView,
} from "@/lib/practice/entries";
import { PRACTICE_REFUSALS } from "@/lib/practice/refusals";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { KeylessItem, ScoreReveal } from "@/lib/ngn/submit";
import { PracticeStartOver, type StartOverState } from "./PracticeStartOver";

export type PracticeAnswerHandler = (
  runId: string,
  itemId: string,
  response: AnyResponse,
) => Promise<ScoreReveal>;

export interface PracticePlayerProps {
  view: PracticeView;
  /** The Server Action that opens a new run, already bound to the bank. */
  startOver: (previous: StartOverState) => Promise<StartOverState>;
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
 * A student practising a shared bank (#241): one entry at a time — an item, or a case study played
 * step by step — with a list to jump between them, Previous and Next, a count of what is done, and
 * Start over.
 *
 * Each item is the shared `ItemPlayer` with its own Submit. The submit goes to the server, which
 * scores it, records it, and only then sends back that one item's key, rationale, scoring rule and
 * score; the player turns to feedback with them, the same renderer with the rule explained. A case
 * study is the shared `CaseStudyPlayer`, whose steps submit the same way one at a time (#46), so
 * each step's key arrives with that step's answer and no sooner. This screen holds no key for
 * anything the student has not answered, and no scoring code (ADR 0003).
 *
 * What is answered is the server's view (`view.entries`, fresh on every reload or refresh) merged
 * with the answers this tab has just been handed back. An answered item reopens in feedback. A
 * refusal that means the screen is out of date reads the page again and says why, once; any other
 * failure is the player's own "could not be checked" beside its Submit.
 *
 * Built at 375px: one column, the list wraps, and the reveal respects reduced motion through the
 * shared player.
 */
export function PracticePlayer({
  view,
  startOver,
  answer = postPracticeAnswer,
}: PracticePlayerProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  // Answers checked in this tab. The server's own list is merged in on every render, so a refresh
  // that brings back an item answered elsewhere closes it here too.
  const [checked, setChecked] = useState<Done>({});
  const [drafts, setDrafts] = useState<Readonly<Record<string, AnyResponse>>>({});
  const [notice, setNotice] = useState<string | null>(null);

  if (view.entries.length === 0) {
    return <p className="measure text-ink-2">This bank has no items to practise yet.</p>;
  }

  const fromServer = serverDone(view.entries);
  const done: Done = { ...fromServer, ...checked };
  const at = Math.min(index, view.entries.length - 1);
  const entry = view.entries[at] as PracticeEntry;
  const answered = Object.keys(done).length;

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

  // A step's row id by the step's own item id, which is unique within its case study.
  const rowOf = new Map<string, string>(
    entry.kind === "case_study" ? entry.steps.map((step) => [step.item.id, step.itemId]) : [],
  );
  const submitStep = (item: KeylessItem) => (response: AnyResponse) => {
    const row = rowOf.get(item.id);
    return row === undefined ? Promise.reject(new Error("unknown step")) : check(row, response);
  };

  return (
    <div className="pb-28">
      <p data-testid="practice-count" className="tabular text-sm text-ink-2">
        {`${answered} of ${view.total} done`}
      </p>

      <SetNav
        entries={view.entries.map((each) => ({
          key: each.kind === "item" ? each.itemId : each.id,
          answered: itemsOf(each).every((step) => done[step.itemId] !== undefined),
        }))}
        current={at}
        onSelect={setIndex}
      />

      {notice ? (
        <p role="alert" className="measure mt-4 text-sm text-incorrect">
          {notice}
        </p>
      ) : null}

      <div className="mt-8">
        {entry.kind === "item" ? (
          <PracticeItem
            // Remounted when the item becomes answered, since ItemPlayer reads its props once.
            key={`${view.runId}:${entry.itemId}:${done[entry.itemId]?.kind ?? "open"}`}
            entry={entry}
            done={done[entry.itemId]}
            draft={drafts[entry.itemId]}
            progress={{ index: at, total: view.entries.length }}
            onDraft={(response) => setDrafts((held) => ({ ...held, [entry.itemId]: response }))}
            check={(response) => check(entry.itemId, response)}
          />
        ) : (
          <section aria-labelledby={`case-${entry.id}`}>
            <h2 id={`case-${entry.id}`} className="mb-4 font-read text-2xl break-words text-ink-1">
              {entry.title}
            </h2>
            <CaseStudyPlayer
              // Remounted when a refresh brings back a step answered elsewhere.
              key={`${view.runId}:${entry.id}:${entry.steps.filter((step) => fromServer[step.itemId]).length}`}
              caseStudy={{
                id: entry.id,
                title: entry.title,
                tags: [],
                ehr: entry.ehr,
                items: entry.steps.map((step) => step.item),
              }}
              initialSteps={entry.steps.map((step) => initialStep(done[step.itemId]))}
              submitFor={submitStep}
            />
          </section>
        )}
      </div>

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <Button variant="secondary" disabled={at === 0} onClick={() => setIndex(at - 1)}>
          Previous item
        </Button>
        <Button
          variant="secondary"
          disabled={at === view.entries.length - 1}
          onClick={() => setIndex(at + 1)}
        >
          Next item
        </Button>
      </div>

      <PracticeStartOver startOver={startOver} />
    </div>
  );
}

interface PracticeItemProps {
  entry: PracticeItemEntry;
  done: PracticeAnswered | undefined;
  draft: AnyResponse | undefined;
  progress: { index: number; total: number };
  onDraft: (response: AnyResponse) => void;
  check: (response: AnyResponse) => Promise<ScoreReveal>;
}

/** One standalone item: open for an answer, or in feedback with what the server sent back. */
function PracticeItem({ entry, done, draft, progress, onDraft, check }: PracticeItemProps) {
  if (done?.kind === "scored") {
    return (
      <ItemPlayer
        item={entry.item}
        initialResponse={done.response}
        initialReveal={done.reveal}
        progress={progress}
        submit={check}
      />
    );
  }
  if (done?.kind === "key") {
    return (
      <ItemPlayer item={entry.item} initialKey={done.key} progress={progress} submit={check} />
    );
  }
  return (
    <ItemPlayer
      item={entry.item}
      initialResponse={draft}
      onResponseChange={onDraft}
      progress={progress}
      submit={check}
    />
  );
}
