"use client";

import { allBlanksFilled, blankOrder } from "../dropdown/DropdownSentence";
import { TokenSentence } from "../dragdrop/TokenSentence";
import { explainRationale } from "../rationale";
import type { ItemRendererModule, ItemRendererProps } from "../types";

export function DragdropRationaleItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"dragdrop_rationale">) {
  const isTriad = blankOrder(item.content.tokens).length === 3;
  return (
    <TokenSentence
      tokens={item.content.tokens}
      bank={item.content.bank}
      reusable={item.content.reusable}
      answers={response.blanks}
      mode={mode}
      correctToken={(id) => item.answerKey?.blanks.find((b) => b.blankId === id)?.correctTokenId}
      anchorBlankId={isTriad ? item.answerKey?.anchorBlankId : undefined}
      onChange={(blanks) => onChange({ type: "dragdrop_rationale", blanks })}
    />
  );
}

export const dragdropRationaleModule: ItemRendererModule<"dragdrop_rationale"> = {
  Renderer: DragdropRationaleItem,
  isComplete: (item, response) => allBlanksFilled(item.content.tokens, response.blanks),
  explainScore: (item, result) =>
    explainRationale(item.content.tokens, item.answerKey.anchorBlankId, result),
};
