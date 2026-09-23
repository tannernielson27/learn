"use client";

import {
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useRef, type KeyboardEvent } from "react";
import { FeedbackIcon, feedbackLabel } from "../OptionRow";
import type { ElementFeedback, PlayerMode } from "../types";

/**
 * Shared pieces for items filled from a bank of choices (drag-and-drop cloze and rationale,
 * bowtie). Three ways in, one state: drag with a mouse or a long press (dnd-kit, pointer only),
 * or tap a choice and then a slot, which is also the keyboard path.
 */

export interface BankToken {
  id: string;
  label: string;
}

/** Mouse drags start after 6px; touch drags after a 150ms press, so a normal swipe still scrolls. */
export function useTapToPlaceSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );
}

/**
 * The dragged choice follows the pointer, so releasing a mouse drag also clicks it. `isDragging`
 * stays true until that click has been dispatched, so callers can ignore it instead of arming.
 */
export function useDragClickGuard() {
  const dragging = useRef(false);
  return {
    isDragging: () => dragging.current,
    start: () => {
      dragging.current = true;
    },
    end: () => {
      setTimeout(() => {
        dragging.current = false;
      }, 0);
    },
  };
}

export const slotFeedbackClasses: Record<ElementFeedback, string> = {
  neutral: "border-line-strong",
  correct: "border-correct bg-correct-soft",
  incorrect: "border-incorrect bg-incorrect-soft",
  missed: "border-dashed border-correct",
};

interface WordChipProps {
  token: BankToken;
  armed: boolean;
  onChoose: (tokenId: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

/** A choice in the bank. Tap to arm it; drag it onto a slot. */
export function WordChip({ token, armed, onChoose, onKeyDown }: WordChipProps) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({ id: token.id });
  // Lift per docs/04-DESIGN-DIRECTION.md §4: the dragged choice follows the pointer at 1.02 scale.
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

interface DropSlotProps {
  slotId: string;
  /** DOM id for the button, so a caller can move focus to it. */
  id?: string;
  /** Accessible name, including what the slot holds, e.g. "Blank 1 of 2, empty". */
  name: string;
  /** Visible text while the slot is empty. */
  placeholder: string;
  label: string | undefined;
  feedback: ElementFeedback;
  mode: PlayerMode;
  /** The armed choice could go here, so the slot shows as a target. */
  target: boolean;
  /** Full-width block slot (bowtie) instead of an inline blank in a sentence. */
  block?: boolean;
  describedBy?: string;
  onChoose: (slotId: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

/** A place a choice can go: a button that is also a dnd-kit drop target. */
export function DropSlot(props: DropSlotProps) {
  const { slotId, id, name, placeholder, label, feedback, mode, target, block = false } = props;
  const { describedBy, onChoose, onKeyDown } = props;
  const { setNodeRef, isOver } = useDroppable({ id: slotId, disabled: mode !== "answer" });
  const answerClasses =
    target || isOver
      ? `border-dashed border-accent ${isOver ? "bg-accent-soft" : "bg-surface-1"}`
      : label
        ? "border-accent bg-accent-soft"
        : "border-dashed border-line-strong bg-surface-1";
  return (
    <span
      className={
        block
          ? "flex w-full items-center gap-1.5"
          : "inline-flex max-w-full items-center gap-1.5 align-middle"
      }
    >
      <button
        ref={setNodeRef}
        id={id}
        type="button"
        aria-label={name}
        aria-describedby={describedBy}
        disabled={mode !== "answer"}
        onClick={() => onChoose(slotId)}
        onKeyDown={onKeyDown}
        className={`tap-target inline-flex max-w-full items-center rounded-sm border-2 px-3 text-left leading-snug text-ink-1 transition-[background-color,border-color] duration-fast ease-out-expo disabled:cursor-default ${
          block ? "h-20 min-w-0 flex-1 justify-start text-sm" : "min-w-32 justify-center text-base"
        } ${mode === "feedback" ? slotFeedbackClasses[feedback] : answerClasses}`}
      >
        {label ? (
          // Keyed by the choice, so a newly placed choice eases in (the drop settling).
          <span key={label} className="motion-arrive">
            {label}
          </span>
        ) : (
          <span aria-hidden="true" className="font-mono text-xs text-ink-2">
            {placeholder}
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
