"use client";

import {
  allBlanksFilled,
  blankOrder,
  DropdownSentence,
  withAnswer,
} from "../dropdown/DropdownSentence";
import type { ItemRendererModule, ItemRendererProps } from "../types";

export function DropdownRationaleItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"dropdown_rationale">) {
  const isTriad = blankOrder(item.content.tokens).length === 3;
  return (
    <DropdownSentence
      tokens={item.content.tokens}
      blanks={item.content.blanks}
      answers={response.blanks}
      mode={mode}
      correctChoice={(id) => item.answerKey?.blanks.find((b) => b.blankId === id)?.correctChoiceId}
      anchorBlankId={isTriad ? item.answerKey?.anchorBlankId : undefined}
      onChoose={(blankId, choiceId) =>
        onChange({
          type: "dropdown_rationale",
          blanks: withAnswer(item.content.tokens, response.blanks, blankId, choiceId),
        })
      }
    />
  );
}

export const dropdownRationaleModule: ItemRendererModule<"dropdown_rationale"> = {
  Renderer: DropdownRationaleItem,
  isComplete: (item, response) => allBlanksFilled(item.content.tokens, response.blanks),
  explainScore: (item, result) => {
    const order = blankOrder(item.content.tokens);
    if (order.length !== 3) return "Dyad: the point is earned only when both blanks are correct.";
    // Mirrors the engine: without an explicit anchor, the first blank anchors the triad.
    const anchorId = item.answerKey.anchorBlankId ?? order[0];
    const anchorCorrect = result.breakdown.find((b) => b.elementId === anchorId)?.correct ?? false;
    const lead = `Triad: Blank ${order.indexOf(anchorId) + 1} is the anchor.`;
    return anchorCorrect
      ? `${lead} It was correct, so each correct supporting blank earns a point.`
      : `${lead} It was incorrect, so the supporting blanks earn nothing.`;
  },
};
