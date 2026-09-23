"use client";

import { blankOrder, DropdownSentence, withAnswer } from "../dropdown/DropdownSentence";
import type { ItemRendererProps } from "../types";

export function DropdownRationaleItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"dropdown_rationale">) {
  const isTriad = blankOrder(item.content.tokens).length === 3;
  return (
    <DropdownSentence
      blankRationale={(blankId) => item.rationale?.perElement?.[blankId]}
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
