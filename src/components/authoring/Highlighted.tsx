import { Fragment } from "react";
import type { Segment } from "@/lib/authoring/highlight";

export interface HighlightedProps {
  segments: readonly Segment[];
}

/**
 * Text with a search's matched words marked. Every segment renders as React text, so item text is
 * escaped however it reads; nothing here is ever set as HTML.
 */
export function Highlighted({ segments }: HighlightedProps) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark
            key={index}
            className="rounded-xs bg-accent-soft px-0.5 font-medium text-accent-ink"
          >
            {segment.text}
          </mark>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
