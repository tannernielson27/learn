import type { ComponentType } from "react";
import type { ItemOf, ItemType, ResponseOf } from "@/lib/ngn/schemas";
import type { ScoreBreakdownEntry, ScoreResult } from "@/lib/ngn/types";

export type PlayerMode = "answer" | "review" | "feedback";

/**
 * What a renderer receives. In `answer` and `review` modes the answer key is absent;
 * in `feedback` mode it is present so the renderer can mark correct, incorrect and missed elements.
 */
export type PlayerItem<T extends ItemType> = Omit<ItemOf<T>, "answerKey" | "rationale"> & {
  answerKey?: ItemOf<T>["answerKey"];
  rationale?: ItemOf<T>["rationale"];
};

export interface ItemRendererProps<T extends ItemType> {
  item: PlayerItem<T>;
  response: ResponseOf<T>;
  mode: PlayerMode;
  /** Present in feedback mode; produced by the scoring engine. */
  breakdown?: readonly ScoreBreakdownEntry[];
  onChange: (response: ResponseOf<T>) => void;
}

export interface ItemRendererModule<T extends ItemType> {
  Renderer: ComponentType<ItemRendererProps<T>>;
  /** Whether the response is complete enough to submit (Select N needs exactly N, etc.). */
  isComplete: (item: PlayerItem<T>, response: ResponseOf<T>) => boolean;
  /** Optional item-specific sentence for the score panel, e.g. naming a triad's anchor. */
  explainScore?: (item: ItemOf<T>, result: ScoreResult) => string | undefined;
}

/** Feedback state of a single selectable element, derived from response + answer key. */
export type ElementFeedback = "correct" | "incorrect" | "missed" | "neutral";

export function elementFeedback(
  selected: boolean,
  isCorrect: boolean,
  mode: PlayerMode,
): ElementFeedback {
  if (mode !== "feedback") return "neutral";
  if (selected && isCorrect) return "correct";
  if (selected && !isCorrect) return "incorrect";
  if (!selected && isCorrect) return "missed";
  return "neutral";
}
