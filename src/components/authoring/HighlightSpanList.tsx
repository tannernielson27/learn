"use client";

import { Button } from "@/components/ui/Button";
import type { MarkedSpan } from "@/lib/authoring/forms/highlight";

export interface HighlightSpanListProps {
  spans: readonly MarkedSpan[];
  correctSpanIds: readonly string[];
  spanRationales: Readonly<Record<string, string>>;
  ids: string;
  /** Points each checkbox at the "mark a correct phrase" problem, when there is one. */
  describedBy?: string;
  onToggleCorrect: (spanId: string, correct: boolean) => void;
  onRationaleChange: (spanId: string, text: string) => void;
  onRemove: (spanId: string) => void;
}

const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong";

/**
 * The selectable phrases of a highlight item, in reading order, each with its answer, an optional
 * reason and a way to unmark it. Shared by the text and table editors.
 */
export function HighlightSpanList({
  spans,
  correctSpanIds,
  spanRationales,
  ids,
  describedBy,
  onToggleCorrect,
  onRationaleChange,
  onRemove,
}: HighlightSpanListProps) {
  const correct = new Set(correctSpanIds);
  const legendId = `${ids}-spans-legend`;
  // The same phrase can be marked more than once; number the repeats so every control is named apart.
  const seen = new Map<string, number>();
  const names = spans.map((span) => {
    const count = (seen.get(span.phrase) ?? 0) + 1;
    seen.set(span.phrase, count);
    return count === 1 ? span.phrase : `${span.phrase} (${count})`;
  });
  return (
    <fieldset aria-labelledby={legendId} className="flex flex-col gap-3">
      <legend id={legendId} className="text-sm font-medium text-ink-1">
        Selectable phrases
      </legend>
      {spans.length === 0 ? (
        <p className="text-sm text-ink-2">
          No phrases marked yet. Select a phrase and choose Mark span.
        </p>
      ) : null}
      {spans.map((span, index) => (
        // Position is part of the key: a hand-typed duplicate id must not share React state.
        <div
          key={`${span.id}-${index}`}
          className="flex flex-col gap-2 rounded-sm border border-line p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="tap-target flex items-center gap-2 text-base text-ink-1">
              <input
                type="checkbox"
                className="size-5 accent-accent"
                checked={correct.has(span.id)}
                aria-describedby={describedBy}
                onChange={(event) => onToggleCorrect(span.id, event.target.checked)}
              />
              {names[index]} is correct
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(span.id)}>
              Remove span {names[index]}
            </Button>
          </div>
          <label htmlFor={`${ids}-span-${index}-why`} className="text-sm text-ink-2">
            Why {names[index]} is right or wrong (optional)
          </label>
          <textarea
            id={`${ids}-span-${index}-why`}
            rows={2}
            className={fieldClass}
            value={spanRationales[span.id] ?? ""}
            onChange={(event) => onRationaleChange(span.id, event.target.value)}
          />
        </div>
      ))}
    </fieldset>
  );
}
