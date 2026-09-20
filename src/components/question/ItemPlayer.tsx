"use client";

import { useEffect, useRef, useState } from "react";
import type { AnyResponse, Item, ItemOf, ItemType, ResponseOf } from "@/lib/ngn/schemas";
import { initialResponse as firstResponse } from "@/lib/ngn/presentation";
import type { KeylessItem, SubmitHandler } from "@/lib/ngn/submit";
import { SAMPLE_TAG, type ScoreResult } from "@/lib/ngn/types";
import { QuestionShell } from "./QuestionShell";
import { RENDERERS } from "./registry";
import type { ItemRendererModule, PlayerItem, PlayerMode } from "./types";

export interface ItemPlayerProps {
  /**
   * The item to play. Normally keyless: the key, rationale and scoring arrive only with the score
   * (ADR 0003). The gallery and the authoring preview pass a full item, because the handler they
   * pass scores it in the same browser.
   */
  item: Item | KeylessItem;
  /** Starting mode. The player moves itself from answer to feedback on submit. */
  initialMode?: PlayerMode;
  progress?: { index: number; total: number };
  /**
   * Has the answer checked (#56). The player holds no scoring code of its own, so this is the only
   * way an answer is ever scored: resolve with the score and what to reveal beside it, or reject
   * when the answer could not be checked. Student-facing callers pass a handler that goes to the
   * server; the gallery and the authoring preview pass `scoreInProcess(item)`.
   */
  submit: SubmitHandler;
  onSubmitted?: (response: AnyResponse, result: ScoreResult) => void;
  /** Response to open with, e.g. what a case-study step was left holding. */
  initialResponse?: AnyResponse;
  /**
   * Score to open with, so a step already submitted reopens in feedback with its own marks.
   * Supplying one implies feedback mode: a scored item is never open for answering again.
   */
  initialResult?: ScoreResult;
  /** Every change, so a caller that unmounts the player can hand the response back later. */
  onResponseChange?: (response: AnyResponse) => void;
  /** Names the question region when more than one player is on the page. */
  label?: string;
}

const CHECK_FAILED = "Your answer could not be checked. Try again.";

/**
 * Strip the answer key, and the rationale with it, unless the mode is feedback. Renderers never
 * see either while answering: "option C is wrong because…" gives the answer away as surely as the
 * key does.
 */
export function toPlayerItem(item: Item, mode: PlayerMode): PlayerItem<ItemType> {
  if (mode === "feedback") return item;
  const rest: Record<string, unknown> = { ...item };
  delete rest.answerKey;
  delete rest.rationale;
  return rest as PlayerItem<ItemType>;
}

export function ItemPlayer({
  item,
  initialMode = "answer",
  progress,
  submit: submitResponse,
  onSubmitted,
  initialResponse,
  initialResult,
  onResponseChange,
  label,
}: ItemPlayerProps) {
  const [mode, setMode] = useState<PlayerMode>(initialResult ? "feedback" : initialMode);
  const [response, setResponse] = useState<AnyResponse>(
    // Building a first response reads only the item's content, never its key.
    () => initialResponse ?? firstResponse(item as Item),
  );
  const [result, setResult] = useState<ScoreResult | undefined>(initialResult);
  const [reveal, setReveal] = useState<Pick<Item, "answerKey" | "rationale" | "scoring"> | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  // A ref, not state: a second tap in the same frame must not send a second request.
  const pending = useRef(false);
  // A check that survives into a promise callback. `pending` only guards one mounted player; a
  // case study unmounts this one when the student opens Review or steps away, and a submit still
  // in flight must not come back and report a score for a step that has since been answered again.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const rendererModule = RENDERERS[item.type] as ItemRendererModule<ItemType> | undefined;
  if (!rendererModule) {
    return (
      <div className="rounded-md border border-dashed border-line-strong p-6 text-sm text-ink-2">
        No renderer for this item type yet.
      </div>
    );
  }

  // The item with its key, rationale and scoring once the server has revealed them. A keyless item
  // has none of them before then, and nothing below reads them until there is a score.
  const fullItem = (reveal ? { ...item, ...reveal } : item) as Item;
  const rationale = "rationale" in fullItem ? fullItem.rationale?.general : undefined;

  // Feedback mode is not itself the reveal: a caller can open in it with nothing scored yet, and
  // until there is a score there is nothing to explain and nothing to hand over.
  const revealed = mode === "feedback" && result !== undefined;
  const playerItem = toPlayerItem(fullItem, revealed ? "feedback" : "answer") as PlayerItem<
    typeof item.type
  >;
  const canSubmit = rendererModule.isComplete(
    playerItem as PlayerItem<ItemType>,
    response as ResponseOf<ItemType>,
  );

  const finish = (next: ScoreResult) => {
    setResult(next);
    setMode("feedback");
    onSubmitted?.(response, next);
  };

  const submit = () => {
    if (pending.current) return;
    pending.current = true;
    setSubmitting(true);
    setSubmitError(undefined);
    submitResponse(response)
      .then(
        (checked) => {
          if (!live.current) return;
          setReveal({
            answerKey: checked.answerKey,
            rationale: checked.rationale,
            scoring: checked.scoring,
          });
          finish(checked.score);
        },
        () => {
          if (!live.current) return;
          setSubmitError(CHECK_FAILED);
        },
      )
      .finally(() => {
        pending.current = false;
        setSubmitting(false);
      });
  };

  const Renderer = rendererModule.Renderer;
  const scoreNote = result
    ? rendererModule.explainScore?.(fullItem as ItemOf<ItemType>, result)
    : undefined;

  return (
    <QuestionShell
      stem={item.stem}
      instructions={item.instructions}
      mode={mode}
      progress={progress}
      canSubmit={canSubmit}
      onSubmit={submit}
      submitting={submitting}
      submitError={submitError}
      score={result}
      scoreNote={scoreNote}
      rationale={rationale}
      sample={item.tags.includes(SAMPLE_TAG)}
      label={label}
    >
      <Renderer
        item={playerItem as PlayerItem<ItemType> & ItemOf<ItemType>}
        response={response as ResponseOf<ItemType>}
        mode={mode}
        score={result}
        onChange={(next) => {
          // Hold the answer that was sent while it is scored, so the feedback shows that answer.
          if (pending.current) return;
          setSubmitError(undefined);
          setResponse(next);
          onResponseChange?.(next);
        }}
      />
    </QuestionShell>
  );
}
