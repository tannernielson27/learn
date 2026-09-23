"use client";

import { HighlightTokens, spanOrder, toggleSpan } from "../highlight/HighlightTokens";
import type { ItemRendererProps } from "../types";

export function HighlightTextItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"highlight_text">) {
  const order = spanOrder(item.content.passage);
  return (
    <p className="ehr-note leading-[2.875]">
      <HighlightTokens
        tokens={item.content.passage}
        selected={new Set(response.spanIds)}
        correct={new Set(item.answerKey?.correctSpanIds ?? [])}
        mode={mode}
        onToggle={(spanId) =>
          onChange({ type: "highlight_text", spanIds: toggleSpan(order, response.spanIds, spanId) })
        }
      />
    </p>
  );
}
