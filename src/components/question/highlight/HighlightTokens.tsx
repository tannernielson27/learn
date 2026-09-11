"use client";

import { Fragment, type KeyboardEvent } from "react";
import { FeedbackIcon, feedbackLabel } from "../OptionRow";
import { elementFeedback, type ElementFeedback, type PlayerMode } from "../types";

export type HighlightToken =
  { kind: "text"; value: string } | { kind: "span"; spanId: string; value: string };

/** Span ids in reading order. */
export function spanOrder(tokens: readonly HighlightToken[]): string[] {
  return tokens.flatMap((t) => (t.kind === "span" ? [t.spanId] : []));
}

/** A new selection with one span flipped, kept in reading order. */
export function toggleSpan(
  order: readonly string[],
  selected: readonly string[],
  spanId: string,
): string[] {
  const current = new Set(selected);
  return order.filter((id) => (id === spanId ? !current.has(id) : current.has(id)));
}

export interface HighlightTokensProps {
  tokens: readonly HighlightToken[];
  selected: ReadonlySet<string>;
  /** Correct span ids; empty outside feedback mode. */
  correct: ReadonlySet<string>;
  mode: PlayerMode;
  onToggle: (spanId: string) => void;
}

// The vertical padding makes each span a 44px touch target while the background stays on the
// text (bg-clip-content). Callers set leading-[2.875] (46px at 16px) so padded lines never
// overlap, whatever the font's content-area height.
const base =
  "py-3 bg-clip-content box-decoration-clone underline underline-offset-[5px] transition-[background-color,text-decoration-color] duration-fast ease-out-expo";

const feedbackClasses: Record<ElementFeedback, string> = {
  neutral: "no-underline",
  correct: "bg-correct-soft decoration-correct decoration-2",
  incorrect: "bg-incorrect-soft decoration-incorrect decoration-2",
  missed: "decoration-correct decoration-dashed decoration-2",
};

function stateClasses(selected: boolean, feedback: ElementFeedback, mode: PlayerMode): string {
  if (mode === "feedback") return `cursor-default ${feedbackClasses[feedback]}`;
  const cursor = mode === "answer" ? "cursor-pointer" : "cursor-default";
  if (selected) return `${cursor} bg-accent-soft decoration-accent decoration-2`;
  return `${cursor} decoration-line-strong decoration-1 ${mode === "answer" ? "hover:bg-surface-2" : ""}`;
}

/**
 * Inline text with author-defined highlightable spans (docs/04-DESIGN-DIRECTION.md §4). Each span
 * is a toggle button that wraps with the surrounding text; plain text is inert. Feedback marks
 * every span that was selected or should have been.
 */
export function HighlightTokens({
  tokens,
  selected,
  correct,
  mode,
  onToggle,
}: HighlightTokensProps) {
  const interactive = mode === "answer";
  return (
    <>
      {tokens.map((token, index) => {
        if (token.kind === "text") return <Fragment key={index}>{token.value}</Fragment>;
        const isSelected = selected.has(token.spanId);
        const feedback = elementFeedback(isSelected, correct.has(token.spanId), mode);
        const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
          if (event.key !== " " && event.key !== "Enter") return;
          event.preventDefault();
          onToggle(token.spanId);
        };
        return (
          <Fragment key={index}>
            <span
              role="button"
              tabIndex={interactive ? 0 : -1}
              aria-pressed={isSelected}
              aria-disabled={interactive ? undefined : true}
              onClick={interactive ? () => onToggle(token.spanId) : undefined}
              onKeyDown={interactive ? onKeyDown : undefined}
              className={`${base} ${stateClasses(isSelected, feedback, mode)}`}
            >
              {token.value}
            </span>
            {feedback !== "neutral" ? (
              <>
                <span className="sr-only"> {feedbackLabel[feedback]}</span>
                <FeedbackIcon state={feedback} className="ml-1" />
              </>
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}
