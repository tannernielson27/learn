"use client";

import { allBlanksFilled, DropdownSentence, withAnswer } from "../dropdown/DropdownSentence";
import type { ItemRendererModule, ItemRendererProps } from "../types";

export function DropdownClozeItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"dropdown_cloze">) {
  return (
    <DropdownSentence
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

export const dropdownClozeModule: ItemRendererModule<"dropdown_cloze"> = {
  Renderer: DropdownClozeItem,
  isComplete: (item, response) => allBlanksFilled(item.content.tokens, response.blanks),
};
