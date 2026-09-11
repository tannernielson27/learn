"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { SCORING_MODEL_LABELS } from "@/lib/ngn/registry";
import type { RichText } from "@/lib/ngn/schemas";
import type { ScoreResult } from "@/lib/ngn/types";
import { applyStagger } from "./motion";
import type { PlayerMode } from "./types";

export interface QuestionShellProps {
  stem: RichText;
  instructions?: string;
  mode: PlayerMode;
  /** Position within a set, when part of one. */
  progress?: { index: number; total: number };
  /** Whether the current response is complete enough to submit. */
  canSubmit: boolean;
  onSubmit?: () => void;
  /** Present in feedback mode. */
  score?: ScoreResult;
  /** Item-specific note shown under the scoring rule in feedback mode. */
  scoreNote?: string;
  rationale?: RichText;
  children: ReactNode;
}

/** Minimal rich text: paragraphs split on blank lines. Markdown parsing arrives with authoring. */
export function RichTextView({ text, className = "" }: { text: RichText; className?: string }) {
  const paragraphs = text.value.split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} className={i > 0 ? "mt-3" : ""}>
          {p}
        </p>
      ))}
    </div>
  );
}

/**
 * The one frame every item is rendered inside: stem, instructions, the renderer, a fixed submit
 * bar, and (in feedback mode) the score panel that explains the rule applied.
 */
export function QuestionShell({
  stem,
  instructions,
  mode,
  progress,
  canSubmit,
  onSubmit,
  score,
  scoreNote,
  rationale,
  children,
}: QuestionShellProps) {
  const root = useRef<HTMLElement>(null);
  // Before the first feedback frame is painted, give the visible marks their place in the reveal.
  useLayoutEffect(() => {
    if (mode === "feedback" && root.current) applyStagger(root.current);
  }, [mode]);

  return (
    <section
      ref={root}
      aria-label="Question"
      className="flex min-h-full flex-col pb-24"
      data-mode={mode}
    >
      {progress ? (
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-xs text-ink-2">
            {progress.index + 1} of {progress.total}
          </span>
          <div className="h-1 flex-1 rounded-full bg-surface-2" aria-hidden="true">
            <div
              className="h-1 rounded-full bg-accent transition-transform duration-base ease-out-expo"
              style={{
                width: "100%",
                transform: `scaleX(${(progress.index + 1) / progress.total})`,
                transformOrigin: "left",
              }}
            />
          </div>
        </div>
      ) : null}

      <RichTextView text={stem} className="stem" />
      {instructions ? <p className="instructions mt-2">{instructions}</p> : null}

      <div className="mt-6">{children}</div>

      {mode === "feedback" && score ? (
        <ScorePanel score={score} note={scoreNote} rationale={rationale} />
      ) : null}

      {mode === "answer" ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface-1/95 px-5 py-3 backdrop-blur-sm [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-3xl items-center justify-end gap-3">
            {!canSubmit ? (
              <span className="text-sm text-ink-2">Complete the item to submit.</span>
            ) : null}
            <Button variant="primary" disabled={!canSubmit} onClick={onSubmit}>
              Submit
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ScorePanel({
  score,
  note,
  rationale,
}: {
  score: ScoreResult;
  note?: string;
  rationale?: RichText;
}) {
  const model = SCORING_MODEL_LABELS[score.model];
  return (
    <aside
      aria-label="Score"
      className="mt-8 animate-[fade-up_var(--duration-slow)_var(--ease-out-expo)_both] rounded-md border border-line bg-surface-1 p-5"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="eyebrow">Score</p>
        <p className="motion-settle tabular font-mono text-2xl">
          {score.points}
          <span className="text-base text-ink-2"> / {score.maxPoints}</span>
        </p>
      </div>
      <p className="mt-2 text-sm">
        <span className="font-medium">{model.name}.</span>{" "}
        <span className="text-ink-2">{model.explanation}</span>
      </p>
      {note ? <p className="mt-2 text-sm text-ink-1">{note}</p> : null}
      {rationale ? (
        <div className="mt-4 border-t border-line pt-4">
          <p className="eyebrow">Rationale</p>
          <RichTextView text={rationale} className="mt-2 text-ink-1" />
        </div>
      ) : null}
    </aside>
  );
}
