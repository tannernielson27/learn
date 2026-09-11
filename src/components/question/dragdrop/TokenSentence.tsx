"use client";

import {
  DndContext,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Fragment, useId, useRef, useState, type KeyboardEvent } from "react";
import { blankOrder, type SentenceToken } from "../dropdown/DropdownSentence";
import { FeedbackIcon, feedbackLabel } from "../OptionRow";
import { elementFeedback, type ElementFeedback, type PlayerMode } from "../types";

export interface BankToken {
  id: string;
  label: string;
}

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

// Placements are announced by this component's own status region, so dnd-kit stays silent.
const SILENT: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

const feedbackClasses: Record<ElementFeedback, string> = {
  neutral: "border-line-strong",
  correct: "border-correct bg-correct-soft",
  incorrect: "border-incorrect bg-incorrect-soft",
  missed: "border-dashed border-correct",
};

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
 * A sentence with blanks filled from a word bank (drag-and-drop cloze and rationale). Three ways
 * in, one state: drag with a mouse or a long press (dnd-kit), or tap a word and then a blank,
 * which is also the keyboard path (Space or Enter on each, Escape to cancel).
 */
export function TokenSentence(props: TokenSentenceProps) {
  const { tokens, bank, reusable, answers, mode, correctToken, anchorBlankId, onChange } = props;
  const uid = useId();
  const [armed, setArmed] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );
  const order = blankOrder(tokens);
  const labelOf = (tokenId: string | undefined) => bank.find((t) => t.id === tokenId)?.label;
  const placedIn = (blankId: string) => answers.find((a) => a.blankId === blankId)?.tokenId;
  const blankName = (blankId: string) => `blank ${order.indexOf(blankId) + 1} of ${order.length}`;

  // The dragged word follows the pointer, so releasing a mouse drag also clicks it. That click
  // must not arm the word again; the flag clears once the release's click has been dispatched.
  const dragging = useRef(false);
  const endDrag = () => {
    setTimeout(() => {
      dragging.current = false;
    }, 0);
  };

  const place = (tokenId: string, blankId: string) => {
    onChange(withToken(tokens, answers, blankId, tokenId));
    setArmed(null);
    setMessage(`${labelOf(tokenId)} placed in ${blankName(blankId)}.`);
  };
  const chooseToken = (tokenId: string) => {
    if (dragging.current) return;
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
    endDrag();
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
      onDragStart={() => {
        dragging.current = true;
      }}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
      accessibility={{ announcements: SILENT }}
    >
      <p className="option measure text-lg leading-[2.6]">
        {tokens.map((token, index) =>
          token.kind === "text" ? (
            <Fragment key={index}>{token.value}</Fragment>
          ) : (
            <BlankSlot
              key={index}
              blankId={token.blankId}
              n={order.indexOf(token.blankId) + 1}
              of={order.length}
              label={labelOf(placedIn(token.blankId))}
              feedback={feedbackOf(token.blankId)}
              mode={mode}
              armed={armed !== null}
              anchorId={
                mode === "feedback" && token.blankId === anchorBlankId ? `${uid}-anchor` : undefined
              }
              onChoose={chooseBlank}
              onKeyDown={cancelOnEscape}
            />
          ),
        )}
      </p>
      {mode === "answer" ? (
        <div
          role="group"
          aria-label="Word bank"
          className="mt-6 flex flex-wrap gap-2 rounded-sm border border-line bg-surface-2 p-3"
        >
          {available.map((t) => (
            <BankChip
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

interface BankChipProps {
  token: BankToken;
  armed: boolean;
  onChoose: (tokenId: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

/** A word in the bank. Tap to arm it; drag it onto a blank. dnd-kit supplies pointer drag only. */
function BankChip({ token, armed, onChoose, onKeyDown }: BankChipProps) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({ id: token.id });
  // Lift per docs/04-DESIGN-DIRECTION.md §4: the dragged word follows the pointer at 1.02 scale.
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(1.02)` }
    : undefined;
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-pressed={armed}
      {...listeners}
      onClick={() => onChoose(token.id)}
      onKeyDown={onKeyDown}
      style={style}
      className={`option tap-target inline-flex touch-manipulation items-center rounded-sm border px-3 text-left transition-[background-color,border-color,box-shadow] duration-fast ease-out-expo ${
        armed
          ? "border-accent bg-accent-soft ring-2 ring-accent"
          : "border-line-strong bg-surface-1 hover:bg-surface-2"
      } ${isDragging ? "relative z-10 cursor-grabbing shadow-md" : "cursor-grab"}`}
    >
      {token.label}
    </button>
  );
}

interface BlankSlotProps {
  blankId: string;
  n: number;
  of: number;
  label: string | undefined;
  feedback: ElementFeedback;
  mode: PlayerMode;
  /** A word is armed, so every blank is a valid target. */
  armed: boolean;
  /** Id of the visible Anchor tag, when this blank anchors a triad in feedback. */
  anchorId?: string;
  onChoose: (blankId: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

function BlankSlot(props: BlankSlotProps) {
  const { blankId, n, of, label, feedback, mode, armed, anchorId, onChoose, onKeyDown } = props;
  const { setNodeRef, isOver } = useDroppable({ id: blankId, disabled: mode !== "answer" });
  const answerClasses =
    armed || isOver
      ? `border-dashed border-accent ${isOver ? "bg-accent-soft" : "bg-surface-1"}`
      : label
        ? "border-accent bg-accent-soft"
        : "border-dashed border-line-strong bg-surface-1";
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 align-middle">
      {anchorId ? (
        <span id={anchorId} className="eyebrow">
          Anchor
        </span>
      ) : null}
      <button
        ref={setNodeRef}
        type="button"
        aria-label={`Blank ${n} of ${of}${label ? `: ${label}` : ", empty"}`}
        aria-describedby={anchorId}
        disabled={mode !== "answer"}
        onClick={() => onChoose(blankId)}
        onKeyDown={onKeyDown}
        className={`tap-target inline-flex min-w-32 max-w-full items-center justify-center rounded-sm border-2 px-3 text-left text-base leading-snug text-ink-1 transition-[background-color,border-color] duration-fast ease-out-expo disabled:cursor-default ${
          mode === "feedback" ? feedbackClasses[feedback] : answerClasses
        }`}
      >
        {label ?? (
          <span aria-hidden="true" className="font-mono text-xs text-ink-2">
            Blank {n}
          </span>
        )}
      </button>
      {feedback !== "neutral" ? (
        <>
          <span className="sr-only">{feedbackLabel[feedback]}</span>
          <FeedbackIcon state={feedback} className="" />
        </>
      ) : null}
    </span>
  );
}
