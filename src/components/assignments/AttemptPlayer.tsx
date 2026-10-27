"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RecordLayout } from "@/components/ehr/RecordLayout";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { ActionBar } from "@/components/question/ActionBar";
import { SetNav } from "@/components/question/SetNav";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
// Module by module, never a barrel: this is a screen a student loads, and the scoring engine must
// not reach its bundle (ADR 0003, `noClientScoring.test.ts`). Types from server modules only.
import { ATTEMPT_REFUSALS, type AttemptRefusal } from "@/lib/assignments/attemptRefusals";
import type { AttemptItemPayload } from "@/lib/assignments/attemptView";
import {
  createAutosaver,
  type Autosaver,
  type SaveResult,
  type SaveStatus,
} from "@/lib/assignments/autosave";
import { postAttemptAnswer } from "@/lib/assignments/saveClient";
import type { EhrRecordView } from "@/lib/ngn/chartReveal";
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { ScoreReveal } from "@/lib/ngn/submit";

/** What the submit action answers: nothing when it worked (the page is read again), or why not. */
export type SubmitAttemptResult = { error: string } | undefined;

export interface AttemptPlayerProps {
  attemptId: string;
  attemptNumber: number;
  items: readonly AttemptItemPayload[];
  /**
   * How many items the set has (#335). A case study is sent only the steps reached, so this can be
   * more than `items.length`; the next step arrives when the page is read again, which this player
   * asks for once the last step it holds has an answer saved. `items.length` when absent.
   */
  total?: number;
  /**
   * A case study's patient record at each step in `items`, step 1 first (#335), cut on the
   * server. The step on screen shows its own; absent for a bank. For a whole quiz that plays case
   * studies in place (#470), one per item: a step's chart, or null on a loose question.
   */
  records?: readonly (EhrRecordView | null)[];
  /** The Server Action that scores and submits this attempt on the server. */
  submit: (attemptId: string) => Promise<SubmitAttemptResult>;
  /** Saves one answer. Defaults to `POST /api/assignments/save`; injected by tests. */
  save?: (attemptId: string, itemId: string, response: AnyResponse) => Promise<SaveResult>;
}

const STATUS_COPY: Record<Exclude<SaveStatus, "stopped">, string> = {
  // Nothing until the first change: the line keeps its height (`min-h-5`) so nothing moves.
  idle: "",
  saving: "Saving",
  saved: "Saved",
  retrying: "Not saved, retrying",
};

const UNSAVED = "Some answers are not saved yet. Check your connection and try again.";

/** Never called: an assignment's items have no Submit of their own (`showSubmit={false}`). */
const noItemSubmit = (): Promise<ScoreReveal> =>
  Promise.reject(new Error("An assignment's items are submitted together."));

/**
 * One autosaver per mounted player. Made in an effect rather than during render, so React's
 * development double mount gets a fresh one instead of a disposed one; leaving the page sends what
 * is still waiting before the saver stops.
 */
function useAutosaver(
  attemptId: string,
  save: NonNullable<AttemptPlayerProps["save"]>,
  onStatus: (status: SaveStatus, refusal?: AttemptRefusal) => void,
): Pick<Autosaver<AnyResponse>, "change" | "flush"> {
  const onStatusRef = useRef(onStatus);
  const saverRef = useRef<Autosaver<AnyResponse> | null>(null);
  useEffect(() => {
    onStatusRef.current = onStatus;
  });

  useEffect(() => {
    const saver = createAutosaver<AnyResponse>({
      save: (itemId, response) => save(attemptId, itemId, response),
      onStatus: (status, refusal) => onStatusRef.current(status, refusal),
    });
    saverRef.current = saver;
    // Leaving with an answer still on its way asks first; the browser words the question.
    const warn = (event: BeforeUnloadEvent) => {
      if (saver.hasUnsaved()) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      saverRef.current = null;
      void saver.flush().finally(() => saver.dispose());
    };
  }, [attemptId, save]);

  const [handle] = useState(() => ({
    change: (itemId: string, response: AnyResponse) => saverRef.current?.change(itemId, response),
    flush: () => saverRef.current?.flush() ?? Promise.resolve(false),
  }));
  return handle;
}

/**
 * A student working through an assignment (#208): every item of the set, keyless, with a list to
 * jump between them and Previous and Next, each change saved to the server as it is made, and one
 * Submit for the whole attempt.
 *
 * Each item is the shared `ItemPlayer` without its own Submit bar. A change goes to the autosaver,
 * which saves it (debounced, last write wins) and says so in the status line: "Saving", "Saved",
 * or "Not saved, retrying". The answers came from the server, so a reload or another device opens
 * on them. Submitting first sends anything still waiting, then asks the server to score the set;
 * what comes back is "Submitted" and nothing about right or wrong (ADR 0003, #210).
 *
 * A refusal no retry fixes (the assignment closed, the attempt was submitted elsewhere) stops
 * saving and reads the page again, which then says what happened.
 *
 * Built at 375px: one column, the list wraps, the bar sits above the home indicator.
 */
export function AttemptPlayer({
  attemptId,
  attemptNumber,
  items,
  total = items.length,
  records,
  submit,
  save = postAttemptAnswer,
}: AttemptPlayerProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [typed, setAnswers] = useState<Record<string, AnyResponse>>({});
  // What the server says was saved, under what this tab has typed since. A step that arrives on a
  // later read of the page (#335) brings its own saved answer with it.
  const answers: Record<string, AnyResponse> = {
    ...Object.fromEntries(
      items.flatMap((entry) => (entry.saved ? [[entry.itemId, entry.saved] as const] : [])),
    ),
    ...typed,
  };
  const last = items.at(-1);
  const waitingForNext =
    last !== undefined && items.length < total && answers[last.itemId] !== undefined;
  const [status, setStatus] = useState<{ status: SaveStatus; refusal?: AttemptRefusal }>({
    status: "idle",
  });
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saver = useAutosaver(attemptId, save, (next, refusal) => {
    setStatus({ status: next, refusal });
    // A refusal reads the page for what happened; a saved answer to the last step this page holds
    // reads it for the next step and its chart, which the server sends only now (#335).
    if (next === "stopped" || (next === "saved" && waitingForNext)) router.refresh();
  });

  if (items.length === 0) {
    return <p className="measure text-ink-2">This assignment has no questions.</p>;
  }

  const at = Math.min(index, items.length - 1);
  const entry = items[at] as AttemptItemPayload;
  const answered = items.filter((each) => answers[each.itemId] !== undefined).length;
  const statusText =
    status.status === "stopped"
      ? ATTEMPT_REFUSALS[status.refusal ?? "failed"]
      : STATUS_COPY[status.status];

  const change = (itemId: string, response: AnyResponse) => {
    setAnswers((held) => ({ ...held, [itemId]: response }));
    setError(null);
    saver.change(itemId, response);
  };

  const submitNow = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const saved = await saver.flush();
    if (!saved) {
      setSubmitting(false);
      setError(UNSAVED);
      return;
    }
    const result = await submit(attemptId);
    // On success the action reads the page again and this player is replaced by "Submitted".
    if (result?.error) {
      setSubmitting(false);
      setError(result.error);
    }
  };

  // The chart of the step on screen (#335): going back a step shows that step's chart again. A
  // loose question of a quiz has none (#470), and the work stays where it is in the layout.
  const record = records?.[Math.min(at, records.length - 1)] ?? null;

  const page = (
    <div className={records === undefined ? "mx-auto max-w-190" : undefined}>
      <p className="eyebrow">{`Attempt ${attemptNumber}`}</p>
      <div className="mt-2 flex items-center gap-4">
        <p
          data-testid="answered-count"
          className="tabular shrink-0 font-mono text-sm font-semibold text-ink-1"
        >
          {`${answered} of ${total} answered`}
        </p>
        <ProgressBar
          className="flex-1"
          value={answered}
          max={total}
          label="Questions answered"
          valueText={`${answered} of ${total} answered`}
        />
      </div>

      <SetNav
        entries={items.map((each) => ({
          key: each.itemId,
          answered: answers[each.itemId] !== undefined,
        }))}
        current={at}
        onSelect={setIndex}
      />

      <div className="mt-8">
        <ItemPlayer
          key={entry.itemId}
          item={entry.item}
          initialResponse={answers[entry.itemId]}
          onResponseChange={(response) => change(entry.itemId, response)}
          submit={noItemSubmit}
          showSubmit={false}
        />
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-2">
        <Button variant="secondary" disabled={at === 0} onClick={() => setIndex(at - 1)}>
          Previous
        </Button>
        <Button
          variant="secondary"
          disabled={at === items.length - 1}
          onClick={() => setIndex(at + 1)}
        >
          Next
        </Button>
      </div>
      {/* #335: the next step is read from the server once this one's answer is saved. */}
      {waitingForNext && at === items.length - 1 ? (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
          <p role="status" className="text-sm text-ink-2">
            Loading the next question.
          </p>
          <Button variant="ghost" size="sm" onClick={() => router.refresh()}>
            Try again
          </Button>
        </div>
      ) : null}

      <ActionBar className="flex-col items-stretch">
        <div className="flex flex-col gap-2">
          {confirming ? (
            <section aria-labelledby="confirm-submit-heading" className="flex flex-col gap-2">
              <h2 id="confirm-submit-heading" className="text-base font-medium text-ink-1">
                {`Submit attempt ${attemptNumber}?`}
              </h2>
              <p className="text-sm text-ink-2">
                {`${answered} of ${total} answered. You cannot change answers after you submit.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  aria-disabled={submitting ? true : undefined}
                  className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                  onClick={() => void submitNow()}
                >
                  {submitting ? "Submitting" : "Submit now"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={submitting}
                  onClick={() => setConfirming(false)}
                >
                  Keep working
                </Button>
              </div>
            </section>
          ) : (
            <div className="flex items-center justify-between gap-3 short:flex-col short:items-stretch">
              <p role="status" data-testid="save-status" className="min-h-5 text-sm text-ink-2">
                {statusText}
              </p>
              <Button
                variant="primary"
                size="lg"
                className="short:px-2 short:whitespace-normal"
                disabled={status.status === "stopped"}
                onClick={() => setConfirming(true)}
              >
                Submit assignment
              </Button>
            </div>
          )}
          {error ? (
            <p role="alert" className="text-sm text-ink-1">
              {error}
            </p>
          ) : null}
        </div>
      </ActionBar>
      {/* Room for the phone's fixed bar, which the last thing on the page must clear. */}
      <div aria-hidden="true" className="h-36 md:hidden" />
    </div>
  );

  const previous = at > 0 ? (records?.[Math.min(at, records.length) - 1] ?? null) : null;
  return records === undefined ? (
    page
  ) : (
    <RecordLayout record={record} previous={previous}>
      {page}
    </RecordLayout>
  );
}
