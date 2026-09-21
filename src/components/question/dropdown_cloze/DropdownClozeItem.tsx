"use client";

import { DropdownSentence, withAnswer } from "../dropdown/DropdownSentence";
import type { ItemRendererProps } from "../types";

export function DropdownClozeItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"dropdown_cloze">) {
  return (
    <DropdownSentence
      blankRationale={(blankId) => item.rationale?.perElement?.[blankId]}
      tokens={item.content.tokens}
      blanks={item.content.blanks}
      answers={response.blanks}
      mode={mode}
      correctChoice={(id) => item.answerKey?.blanks.find((b) => b.blankId === id)?.correctChoiceId}
      onChoose={(blankId, choiceId) =>
        onChange({
          type: "dropdown_cloze",
          blanks: withAnswer(item.content.tokens, response.blanks, blankId, choiceId),
        })
      }
    />
  );
}
