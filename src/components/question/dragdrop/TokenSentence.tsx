"use client";

import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { Fragment, useId, useState, type KeyboardEvent } from "react";
import { blankOrder, type SentenceToken } from "../dropdown/DropdownSentence";
import { elementFeedback, type PlayerMode } from "../types";
import {
  DropSlot,
  SILENT_ANNOUNCEMENTS,
  useDragClickGuard,
  useTapToPlaceSensors,
  WordChip,
  type BankToken,
} from "./tapToPlace";

export type { BankToken } from "./tapToPlace";

export interface TokenAnswer {
  blankId: string;
  tokenId: string;
}

/** A new answer list with one blank set or cleared, kept in reading order. */
export function withToken(
  tokens: readonly SentenceToken[],
  answers: readonly TokenAnswer[],
  blankId: string,
  tokenId: string | undefined,
): TokenAnswer[] {
  return blankOrder(tokens).flatMap((id) => {
    const value = id === blankId ? tokenId : answers.find((a) => a.blankId === id)?.tokenId;
    return value ? [{ blankId: id, tokenId: value }] : [];
  });
}

export interface TokenSentenceProps {
  tokens: readonly SentenceToken[];
  bank: readonly BankToken[];
  /** Bank words stay available after they are placed. */
  reusable: boolean;
  answers: readonly TokenAnswer[];
  mode: PlayerMode;
  /** Correct token per blank; only present in feedback mode. */
  correctToken: (blankId: string) => string | undefined;
  /** Triad anchor, tagged in feedback mode. */
  anchorBlankId?: string;
  onChange: (answers: TokenAnswer[]) => void;
}

/**
 * A sentence with blanks filled from a word bank (drag-and-drop cloze and rationale). Drag with a
 * mouse or a long press, or tap a word and then a blank, which is also the keyboard path (Space or
 * Enter on each, Escape to cancel).
 */
export function TokenSentence(props: TokenSentenceProps) {
  const { tokens, bank, reusable, answers, mode, correctToken, anchorBlankId, onChange } = props;
  const uid = useId();
  const [armed, setArmed] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const sensors = useTapToPlaceSensors();
  const guard = useDragClickGuard();
  const order = blankOrder(tokens);
  const labelOf = (tokenId: string | undefined) => bank.find((t) => t.id === tokenId)?.label;
  const placedIn = (blankId: string) => answers.find((a) => a.blankId === blankId)?.tokenId;
  const blankName = (blankId: string) => `blank ${order.indexOf(blankId) + 1} of ${order.length}`;

  const place = (tokenId: string, blankId: string) => {
    onChange(withToken(tokens, answers, blankId, tokenId));
    setArmed(null);
    setMessage(`${labelOf(tokenId)} placed in ${blankName(blankId)}.`);
  };
  const chooseToken = (tokenId: string) => {
    if (guard.isDragging()) return;
    const same = armed === tokenId;
    setArmed(same ? null : tokenId);
    setMessage(
      same ? `${labelOf(tokenId)} deselected.` : `${labelOf(tokenId)} selected. Choose a blank.`,
    );
  };
  const chooseBlank = (blankId: string) => {
    if (armed) return place(armed, blankId);
    const current = placedIn(blankId);
    if (!current) return setMessage("Select a word first, then choose a blank.");
    onChange(withToken(tokens, answers, blankId, undefined));
    setMessage(`${labelOf(current)} removed from ${blankName(blankId)}.`);
  };
  const cancelOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !armed) return;
    setArmed(null);
    setMessage("Selection cancelled.");
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    guard.end();
    if (over) place(String(active.id), String(over.id));
  };

  const used = new Set(answers.map((a) => a.tokenId));
  const available = reusable ? bank : bank.filter((t) => !used.has(t.id));
  const feedbackOf = (blankId: string) => {
    const pick = placedIn(blankId);
    return elementFeedback(pick !== undefined, pick === correctToken(blankId), mode);
  };
  const wrong = mode === "feedback" ? order.filter((id) => feedbackOf(id) !== "correct") : [];

  return (
    <DndContext
      id={uid}
      sensors={sensors}
      onDragStart={guard.start}
      onDragEnd={onDragEnd}
      onDragCancel={guard.end}
      accessibility={{ announcements: SILENT_ANNOUNCEMENTS }}
    >
      <p className="option measure text-lg leading-[2.6]">
        {tokens.map((token, index) => {
          if (token.kind === "text") return <Fragment key={index}>{token.value}</Fragment>;
          const n = order.indexOf(token.blankId) + 1;
          const label = labelOf(placedIn(token.blankId));
          const anchorId =
            mode === "feedback" && token.blankId === anchorBlankId ? `${uid}-anchor` : undefined;
          return (
            <Fragment key={index}>
              {anchorId ? (
                <span id={anchorId} className="eyebrow mr-1.5 align-middle">
                  Anchor
                </span>
              ) : null}
              <DropSlot
                slotId={token.blankId}
                name={`Blank ${n} of ${order.length}${label ? `: ${label}` : ", empty"}`}
                placeholder={`Blank ${n}`}
                label={label}
                feedback={feedbackOf(token.blankId)}
                mode={mode}
                target={armed !== null}
                describedBy={anchorId}
                onChoose={chooseBlank}
                onKeyDown={cancelOnEscape}
              />
            </Fragment>
          );
        })}
      </p>
      {mode === "answer" ? (
        <div
          role="group"
          aria-label="Word bank"
          className="mt-6 flex flex-wrap gap-2 rounded-sm border border-line bg-surface-2 p-3"
        >
          {available.map((t) => (
            <WordChip
              key={t.id}
              token={t}
              armed={armed === t.id}
              onChoose={chooseToken}
              onKeyDown={cancelOnEscape}
            />
          ))}
        </div>
      ) : null}
      {wrong.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-1 text-sm text-ink-2">
          {wrong.map((id) => (
            <li key={id}>
              <span className="font-mono text-xs">Blank {order.indexOf(id) + 1}</span> Correct
              answer: {labelOf(correctToken(id))}
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status" aria-label="Word placement" className="sr-only">
        {message}
      </p>
    </DndContext>
  );
}
