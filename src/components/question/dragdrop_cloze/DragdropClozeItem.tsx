"use client";

import { TokenSentence } from "../dragdrop/TokenSentence";
import type { ItemRendererProps } from "../types";

export function DragdropClozeItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"dragdrop_cloze">) {
  return (
    <TokenSentence
      tokens={item.content.tokens}
      bank={item.content.bank}
      reusable={item.content.reusable}
      answers={response.blanks}
      mode={mode}
      correctToken={(id) => item.answerKey?.blanks.find((b) => b.blankId === id)?.correctTokenId}
      onChange={(blanks) => onChange({ type: "dragdrop_cloze", blanks })}
    />
  );
}
