"use client";

import { Fragment, useId } from "react";
import { FeedbackIcon, feedbackLabel } from "../OptionRow";
import { elementFeedback, type ElementFeedback, type PlayerMode } from "../types";

export type SentenceToken = { kind: "text"; value: string } | { kind: "blank"; blankId: string };

export interface DropdownBlank {
  id: string;
  choices: readonly { id: string; label: string }[];
}

export interface BlankAnswer {
  blankId: string;
  choiceId: string;
}

/** Blank ids in reading order. */
export function blankOrder(tokens: readonly SentenceToken[]): string[] {
  return tokens.flatMap((t) => (t.kind === "blank" ? [t.blankId] : []));
}

/** A new answer list with one blank set or cleared, kept in reading order. */
export function withAnswer(
  tokens: readonly SentenceToken[],
  answers: readonly BlankAnswer[],
  blankId: string,
  choiceId: string | undefined,
): BlankAnswer[] {
  return blankOrder(tokens).flatMap((id) => {
    const value = id === blankId ? choiceId : answers.find((a) => a.blankId === id)?.choiceId;
    return value ? [{ blankId: id, choiceId: value }] : [];
  });
}

export function allBlanksFilled(
  tokens: readonly SentenceToken[],
  answers: readonly BlankAnswer[],
): boolean {
  return blankOrder(tokens).every((id) => answers.some((a) => a.blankId === id));
}

export interface DropdownSentenceProps {
  tokens: readonly SentenceToken[];
  blanks: readonly DropdownBlank[];
  answers: readonly BlankAnswer[];
  mode: PlayerMode;
  /** Correct choice per blank; only present in feedback mode. */
  correctChoice: (blankId: string) => string | undefined;
  /** Triad anchor, tagged in feedback mode. */
  anchorBlankId?: string;
  onChoose: (blankId: string, choiceId: string | undefined) => void;
}

const stateClasses: Record<ElementFeedback, string> = {
  neutral: "",
  correct: "border-correct bg-correct-soft",
  incorrect: "border-incorrect bg-incorrect-soft",
  missed: "border-dashed border-correct",
};

function Mark({ state }: { state: ElementFeedback }) {
  if (state === "neutral") return null;
  return (
    <>
      <span className="sr-only">{feedbackLabel[state]}</span>
      <FeedbackIcon state={state} className="" />
    </>
  );
}

/**
 * A sentence with native drop-downs in its blanks (drop-down cloze and rationale). Native selects
 * size themselves to the longest choice and open the platform picker on phones; the sentence wraps
 * around them. Feedback marks each blank and lists the right answer for any blank that was wrong.
 */
export function DropdownSentence({
  tokens,
  blanks,
  answers,
  mode,
  correctChoice,
  anchorBlankId,
  onChoose,
}: DropdownSentenceProps) {
  const uid = useId();
  const order = blankOrder(tokens);
  const chosen = (id: string) => answers.find((a) => a.blankId === id)?.choiceId;
  const feedbackOf = (id: string) => {
    const pick = chosen(id);
    return elementFeedback(pick !== undefined, pick === correctChoice(id), mode);
  };
  const wrong = mode === "feedback" ? order.filter((id) => feedbackOf(id) !== "correct") : [];

  return (
    <div>
      <p className="option measure text-lg leading-[2.6]">
        {tokens.map((token, index) => {
          if (token.kind === "text") return <Fragment key={index}>{token.value}</Fragment>;
          const blank = blanks.find((b) => b.id === token.blankId);
          if (!blank) return null;
          const n = order.indexOf(blank.id) + 1;
          const pick = chosen(blank.id);
          const feedback = feedbackOf(blank.id);
          const showAnchor = mode === "feedback" && blank.id === anchorBlankId;
          const selectedClass =
            mode !== "feedback" && pick ? "border-accent bg-accent-soft" : "border-line-strong";
          return (
            <span key={index} className="inline-flex max-w-full items-center gap-1.5 align-middle">
              {showAnchor ? (
                <span id={`${uid}-anchor`} className="eyebrow">
                  Anchor
                </span>
              ) : null}
              <select
                aria-label={`Blank ${n} of ${order.length}`}
                aria-describedby={showAnchor ? `${uid}-anchor` : undefined}
                value={pick ?? ""}
                disabled={mode !== "answer"}
                onChange={(event) => onChoose(blank.id, event.target.value || undefined)}
                className={`tap-target max-w-full rounded-sm border bg-surface-1 px-2 text-base leading-normal text-ink-1 transition-[background-color,border-color] duration-fast ease-out-expo disabled:opacity-100 ${
                  mode === "feedback" ? stateClasses[feedback] : selectedClass
                }`}
              >
                <option value="">Select…</option>
                {blank.choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
              <Mark state={feedback} />
            </span>
          );
        })}
      </p>
      {wrong.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1 text-sm text-ink-2">
          {wrong.map((id) => {
            const blank = blanks.find((b) => b.id === id);
            const label = blank?.choices.find((c) => c.id === correctChoice(id))?.label;
            return (
              <li key={id}>
                <span className="font-mono text-xs">Blank {order.indexOf(id) + 1}</span> Correct
                answer: {label}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
