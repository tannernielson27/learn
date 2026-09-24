"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { SetNav } from "@/components/question/SetNav";
import { Button } from "@/components/ui/Button";
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
import type { AnyResponse } from "@/lib/ngn/schemas";
import type { ScoreReveal } from "@/lib/ngn/submit";

/** What the submit action answers: nothing when it worked (the page is read again), or why not. */
export type SubmitAttemptResult = { error: string } | undefined;

export interface AttemptPlayerProps {
  attemptId: string;
  attemptNumber: number;
  items: readonly AttemptItemPayload[];
  /** The Server Action that scores and submits this attempt on the server. */
  submit: (attemptId: string) => Promise<SubmitAttemptResult>;
  /** Saves one answer. Defaults to `POST /api/assignments/save`; injected by tests. */
  save?: (attemptId: string, itemId: string, response: AnyResponse) => Promise<SaveResult>;
}

const STATUS_COPY: Record<Exclude<SaveStatus, "stopped">, string> = {
  idle: "Your answers save as you go.",
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
  submit,
  save = postAttemptAnswer,
}: AttemptPlayerProps) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnyResponse>>(() =>
    Object.fromEntries(
      items.flatMap((entry) => (entry.saved ? [[entry.itemId, entry.saved] as const] : [])),
    ),
  );
  const [status, setStatus] = useState<{ status: SaveStatus; refusal?: AttemptRefusal }>({
    status: "idle",
  });
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saver = useAutosaver(attemptId, save, (next, refusal) => {
    setStatus({ status: next, refusal });
    if (next === "stopped") router.refresh();
  });

  if (items.length === 0) {
    return <p className="measure text-ink-2">This assignment has no items to show.</p>;
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

  return (
    <div className="pb-28">
      <p className="eyebrow">{`Attempt ${attemptNumber}`}</p>
      <p data-testid="answered-count" className="tabular mt-2 text-sm text-ink-2">
        {`${answered} of ${items.length} answered`}
      </p>

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
          progress={{ index: at, total: items.length }}
          submit={noItemSubmit}
          showSubmit={false}
        />
      </div>

      <div className="mt-2 flex flex-wrap justify-between gap-2">
        <Button variant="secondary" disabled={at === 0} onClick={() => setIndex(at - 1)}>
          Previous item
        </Button>
        <Button
          variant="secondary"
          disabled={at === items.length - 1}
          onClick={() => setIndex(at + 1)}
        >
          Next item
        </Button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface-1/95 px-4 py-3 backdrop-blur-sm [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {confirming ? (
            <section aria-labelledby="confirm-submit-heading" className="flex flex-col gap-2">
              <h2 id="confirm-submit-heading" className="text-base font-medium text-ink-1">
                {`Submit attempt ${attemptNumber}?`}
              </h2>
              <p className="text-sm text-ink-2">
                {`${answered} of ${items.length} answered. You cannot change your answers after you submit.`}
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
            <div className="flex items-center justify-between gap-3">
              <p role="status" data-testid="save-status" className="text-sm text-ink-2">
                {statusText}
              </p>
              <Button
                variant="primary"
                disabled={status.status === "stopped"}
                onClick={() => setConfirming(true)}
              >
                Submit assignment
              </Button>
            </div>
          )}
          {error ? (
            <p role="alert" className="text-sm text-incorrect">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
