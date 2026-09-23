"use client";

import { Fragment, useId } from "react";
import { ElementRationaleList } from "../ElementRationale";
import { HighlightTokens, spanOrder, toggleSpan } from "../highlight/HighlightTokens";
import { explainedRuns } from "../highlight/sentences";
import type { ItemRendererProps } from "../types";

export function HighlightTextItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"highlight_text">) {
  const uid = useId();
  const passage = item.content.passage;
  const order = spanOrder(passage);
  // Rationale reaches the renderer in feedback only; the mode check keeps it off the page anyway.
  const why = (spanId: string) =>
    mode === "feedback" ? item.rationale?.perElement?.[spanId] : undefined;
  const whyId = (spanId: string) => `${uid}-why-${spanId}`;
  const tokens = (run: typeof passage) => (
    <HighlightTokens
      tokens={run}
      selected={new Set(response.spanIds)}
      correct={new Set(item.answerKey?.correctSpanIds ?? [])}
      mode={mode}
      describedBy={(spanId) => (why(spanId) ? whyId(spanId) : undefined)}
      onToggle={(spanId) =>
        onChange({ type: "highlight_text", spanIds: toggleSpan(order, response.spanIds, spanId) })
      }
    />
  );

  const runs = explainedRuns(passage, (spanId) => why(spanId) !== undefined);
  if (runs.every((run) => run.spans.length === 0)) {
    return <p className="ehr-note leading-[2.875]">{tokens(passage)}</p>;
  }
  // #49: a span is a phrase inside a note, so its explanation follows the sentence holding it,
  // never the phrase itself: breaking a sentence mid-way would change how the note reads. The
  // note breaks only where an explanation goes; sentences between explained ones stay together.
  return (
    <div className="flex flex-col gap-2">
      {runs.map((run, index) => (
        <Fragment key={index}>
          <p className="ehr-note leading-[2.875]">{tokens(run.tokens)}</p>
          <ElementRationaleList
            className="measure pb-2"
            items={run.spans.map((span) => ({
              id: whyId(span.spanId),
              label: span.value,
              text: why(span.spanId),
            }))}
          />
        </Fragment>
      ))}
    </div>
  );
}
