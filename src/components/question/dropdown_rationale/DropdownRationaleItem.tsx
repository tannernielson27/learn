"use client";

import {
  allBlanksFilled,
  blankOrder,
  DropdownSentence,
  withAnswer,
} from "../dropdown/DropdownSentence";
import { explainRationale } from "../rationale";
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
  explainScore: (item, result) =>
    explainRationale(item.content.tokens, item.answerKey.anchorBlankId, result),
};
