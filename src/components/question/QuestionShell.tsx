"use client";

import { useEffect, useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { RichText } from "@/lib/ngn/schemas";
import type { ScoreResult } from "@/lib/ngn/types";
import { applyStagger } from "./motion";
import { RichTextView } from "./RichTextView";
import { RationalePanel, ScoreBreakdown, ScorePanel } from "./ScorePanel";
import { SubmitBar } from "./SubmitBar";
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
  /** A server is checking the answer: Submit stays in place, says so, and ignores presses. */
  submitting?: boolean;
  /** What Submit says while `submitting`. A live room only sends the answer, so it says that. */
  busyLabel?: string;
  /** Why the last check failed, shown beside Submit. */
  submitError?: string;
  /** What the answer holds so far, beside Submit: "2 selected". */
  submitStatus?: string;
  /** Present in feedback mode. */
  score?: ScoreResult;
  /** Item-specific note shown under the scoring rule in feedback mode. */
  scoreNote?: string;
  rationale?: RichText;
  /** Demo content written for this repo, labelled so it is never taken for a real item. */
  sample?: boolean;
  /** The region's name. Two players on one page need different names, e.g. "Version 1 question". */
  label?: string;
  /**
   * False where answers are not submitted one at a time: an assignment (#208) saves each change and
   * submits the whole set from its own bar, so the item's own Submit bar is not drawn.
   */
  showSubmit?: boolean;
  children: ReactNode;
}

export { RichTextView } from "./RichTextView";

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
  submitting = false,
  busyLabel = "Checking your answer",
  submitError,
  submitStatus,
  score,
  scoreNote,
  rationale,
  sample = false,
  label = "Question",
  showSubmit = true,
  children,
}: QuestionShellProps) {
  const root = useRef<HTMLElement>(null);
  const headingId = useId();
  const scorePanel = useRef<HTMLElement>(null);
  // Set only by a submit made here, so a step reopened already scored does not take focus.
  const focusScore = useRef(false);
  // Before the first feedback frame is painted, give the visible marks their place in the reveal.
  useLayoutEffect(() => {
    if (mode === "feedback" && root.current) applyStagger(root.current);
  }, [mode]);

  // Submitting removes the button that was pressed, so focus moves to the result it produced.
  useEffect(() => {
    if (!score || !focusScore.current) return;
    focusScore.current = false;
    scorePanel.current?.focus();
  }, [score]);

  const submit = () => {
    focusScore.current = true;
    onSubmit?.();
  };

  return (
    <section
      ref={root}
      aria-labelledby={headingId}
      // Room for the phone's fixed bar below, and for the landscape phone's column beside.
      className={`flex min-h-full flex-col ${mode === "answer" && showSubmit ? "max-md:pb-28 short:pr-36 short:pb-0" : ""}`}
      data-mode={mode}
    >
      {/* A level-2 heading in every context (gallery, case study, preview, play), so a renderer's
          own level-3 headings, like the bowtie's columns, never skip a level after the page h1. */}
      <h2 id={headingId} className="sr-only">
        {label}
      </h2>
      {progress ? (
        <div className="mb-4 flex items-center gap-3">
          <span className="tabular font-mono text-sm font-semibold text-ink-1">
            Question {progress.index + 1} of {progress.total}
          </span>
          <ProgressBar
            className="flex-1"
            value={progress.index + 1}
            max={progress.total}
            label="Questions"
            valueText={`Question ${progress.index + 1} of ${progress.total}`}
          />
        </div>
      ) : null}

      {sample ? <p className="eyebrow mb-2">Sample</p> : null}
      <RichTextView text={stem} className="stem" />
      {instructions ? <p className="instructions mt-2">{instructions}</p> : null}

      <div className="mt-6">{children}</div>

      {mode === "feedback" && score ? (
        <>
          <ScorePanel panel={scorePanel} score={score} note={scoreNote} rationale={rationale} />
          <ScoreBreakdown score={score} />
        </>
      ) : mode === "feedback" && rationale ? (
        // A key with no score: shown to someone who did not answer (#181). The rationale is the
        // same text the score panel carries, standing on its own because there are no marks.
        <RationalePanel rationale={rationale} />
      ) : null}

      {mode === "answer" && showSubmit ? (
        <SubmitBar
          canSubmit={canSubmit}
          onSubmit={submit}
          submitting={submitting}
          busyLabel={busyLabel}
          submitError={submitError}
          status={submitStatus}
        />
      ) : null}
    </section>
  );
}
