"use client";

import { useState } from "react";
import type { AnyResponse, Item, ItemOf, ItemType, ResponseOf } from "@/lib/ngn/schemas";
import { emptyResponse, scoreItem } from "@/lib/ngn/scoring";
import type { ScoreResult } from "@/lib/ngn/types";
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
}

/** Strip the answer key unless the mode is feedback. Renderers never see keys while answering. */
export function toPlayerItem(item: Item, mode: PlayerMode): PlayerItem<ItemType> {
  if (mode === "feedback") return item;
  const rest: Record<string, unknown> = { ...item };
  delete rest.answerKey;
  return rest as PlayerItem<ItemType>;
}

export function ItemPlayer({
  item,
  initialMode = "answer",
  progress,
  score = scoreItem,
  onSubmitted,
}: ItemPlayerProps) {
  const [mode, setMode] = useState<PlayerMode>(initialMode);
  const [response, setResponse] = useState<AnyResponse>(() => emptyResponse(item));
  const [result, setResult] = useState<ScoreResult | undefined>(undefined);

  const rendererModule = RENDERERS[item.type] as ItemRendererModule<ItemType> | undefined;
  if (!rendererModule) {
    return (
      <div className="rounded-md border border-dashed border-line-strong p-6 text-sm text-ink-2">
        No renderer for this item type yet.
      </div>
    );
  }

  const playerItem = toPlayerItem(item, mode) as PlayerItem<typeof item.type>;
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
    >
      <Renderer
        item={playerItem as PlayerItem<ItemType> & ItemOf<ItemType>}
        response={response as ResponseOf<ItemType>}
        mode={mode}
        breakdown={result?.breakdown}
        onChange={(next) => setResponse(next)}
      />
    </QuestionShell>
  );
}
