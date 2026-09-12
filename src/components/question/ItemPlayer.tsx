"use client";

import { useState } from "react";
import type { AnyResponse, Item, ItemOf, ItemType, ResponseOf } from "@/lib/ngn/schemas";
import { initialResponse as firstResponse } from "@/lib/ngn/presentation";
import { scoreItem } from "@/lib/ngn/scoring";
import { SAMPLE_TAG, type ScoreResult } from "@/lib/ngn/types";
import { QuestionShell } from "./QuestionShell";
import { RENDERERS } from "./registry";
import type { ItemRendererModule, PlayerItem, PlayerMode } from "./types";

export interface ItemPlayerProps {
  item: Item;
  /** Starting mode. The player moves itself from answer to feedback on submit. */
  initialMode?: PlayerMode;
  progress?: { index: number; total: number };
  /**
   * Scores a response. Defaults to local scoring, which is only acceptable in the gallery;
   * sessions and assignments pass a server-backed function instead.
   */
  score?: (item: Item, response: AnyResponse) => ScoreResult;
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
}

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
  score = scoreItem,
  onSubmitted,
  initialResponse,
  initialResult,
  onResponseChange,
}: ItemPlayerProps) {
  const [mode, setMode] = useState<PlayerMode>(initialResult ? "feedback" : initialMode);
  const [response, setResponse] = useState<AnyResponse>(
    () => initialResponse ?? firstResponse(item),
  );
  const [result, setResult] = useState<ScoreResult | undefined>(initialResult);

  const rendererModule = RENDERERS[item.type] as ItemRendererModule<ItemType> | undefined;
  if (!rendererModule) {
    return (
      <div className="rounded-md border border-dashed border-line-strong p-6 text-sm text-ink-2">
        No renderer for this item type yet.
      </div>
    );
  }

  // Feedback mode is not itself the reveal: a caller can open in it with nothing scored yet, and
  // until there is a score there is nothing to explain and nothing to hand over.
  const revealed = mode === "feedback" && result !== undefined;
  const playerItem = toPlayerItem(item, revealed ? "feedback" : "answer") as PlayerItem<
    typeof item.type
  >;
  const canSubmit = rendererModule.isComplete(
    playerItem as PlayerItem<ItemType>,
    response as ResponseOf<ItemType>,
  );

  const submit = () => {
    const next = score(item, response);
    setResult(next);
    setMode("feedback");
    onSubmitted?.(response, next);
  };

  const Renderer = rendererModule.Renderer;
  const scoreNote = result
    ? rendererModule.explainScore?.(item as ItemOf<ItemType>, result)
    : undefined;

  return (
    <QuestionShell
      stem={item.stem}
      instructions={item.instructions}
      mode={mode}
      progress={progress}
      canSubmit={canSubmit}
      onSubmit={submit}
      score={result}
      scoreNote={scoreNote}
      rationale={item.rationale.general}
      sample={item.tags.includes(SAMPLE_TAG)}
    >
      <Renderer
        item={playerItem as PlayerItem<ItemType> & ItemOf<ItemType>}
        response={response as ResponseOf<ItemType>}
        mode={mode}
        breakdown={result?.breakdown}
        onChange={(next) => {
          setResponse(next);
          onResponseChange?.(next);
        }}
      />
    </QuestionShell>
  );
}
