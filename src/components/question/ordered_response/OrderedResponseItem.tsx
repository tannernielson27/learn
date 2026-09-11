"use client";

import {
  closestCenter,
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useId, useRef, useState } from "react";
import { presentationOrder } from "@/lib/ngn/presentation";
import { FeedbackIcon, feedbackLabel } from "../OptionRow";
import type { ElementFeedback, ItemRendererModule, ItemRendererProps, PlayerMode } from "../types";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

type Direction = "up" | "down";

/** A new order with one step moved one place; out-of-range moves return the order unchanged. */
export function moveStep(order: readonly string[], id: string, direction: Direction): string[] {
  const from = order.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= order.length) return [...order];
  return arrayMove([...order], from, to);
}

// Moves are announced by this component's own status region, so dnd-kit stays silent.
const SILENT: Announcements = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

const feedbackClasses: Record<ElementFeedback, string> = {
  neutral: "border-line",
  correct: "border-line border-l-4 border-l-correct bg-correct-soft",
  incorrect: "border-line border-l-4 border-l-incorrect bg-incorrect-soft",
  missed: "border-dashed border-correct",
};

export function OrderedResponseItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"ordered_response">) {
  const uid = useId();
  const [message, setMessage] = useState("");
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 6 } }),
  );

  // Keyed rows move in the DOM when the order changes; put focus back on the moved step's button.
  useEffect(() => {
    if (!pendingFocus.current) return;
    buttons.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  const steps = item.content.items;
  const labels = new Map(steps.map((s) => [s.id, s.label]));
  // The player normally starts from initialResponse. If an answer is ever missing, fall back to
  // the same seeded shuffle, never the authored order, which is usually the answer.
  const order =
    response.orderedIds.length === steps.length
      ? response.orderedIds
      : presentationOrder(
          steps.map((s) => s.id),
          item.id,
        );
  const key = item.answerKey?.orderedIds ?? [];

  const commit = (next: string[], id: string) => {
    onChange({ type: "ordered_response", orderedIds: next });
    setMessage(`${labels.get(id)}, position ${next.indexOf(id) + 1} of ${next.length}.`);
  };
  const move = (id: string, direction: Direction) => {
    const next = moveStep(order, id, direction);
    const at = next.indexOf(id);
    const sameStillEnabled = direction === "up" ? at > 0 : at < next.length - 1;
    const other = direction === "up" ? "down" : "up";
    pendingFocus.current = `${id}:${sameStillEnabled ? direction : other}`;
    commit(next, id);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    commit(arrayMove([...order], from, to), String(active.id));
  };
  const register = (buttonKey: string, element: HTMLButtonElement | null) => {
    if (element) buttons.current.set(buttonKey, element);
    else buttons.current.delete(buttonKey);
  };

  return (
    <DndContext
      id={uid}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements: SILENT }}
    >
      <SortableContext
        items={order}
        strategy={verticalListSortingStrategy}
        disabled={mode !== "answer"}
      >
        <ol aria-label="Steps in order" className="flex flex-col gap-2">
          {order.map((id, index) => {
            const inPlace = key[index] === id;
            const feedback: ElementFeedback =
              mode === "feedback" && key.length > 0
                ? inPlace
                  ? "correct"
                  : "incorrect"
                : "neutral";
            return (
              <StepRow
                key={id}
                id={id}
                label={labels.get(id) ?? id}
                index={index}
                count={order.length}
                mode={mode}
                feedback={feedback}
                correctPosition={feedback === "incorrect" ? key.indexOf(id) + 1 : undefined}
                onMove={move}
                register={register}
              />
            );
          })}
        </ol>
      </SortableContext>
      <p role="status" aria-label="Order changes" className="sr-only">
        {message}
      </p>
    </DndContext>
  );
}

interface StepRowProps {
  id: string;
  label: string;
  index: number;
  count: number;
  mode: PlayerMode;
  feedback: ElementFeedback;
  /** 1-based position the step belongs in; shown for misplaced steps in feedback. */
  correctPosition?: number;
  onMove: (id: string, direction: Direction) => void;
  register: (buttonKey: string, element: HTMLButtonElement | null) => void;
}

/**
 * One step. Pointer users drag it by the grip (dnd-kit); everyone else, including keyboard and
 * screen-reader users, moves it with the up and down buttons.
 */
function StepRow(props: StepRowProps) {
  const { id, label, index, count, mode, feedback, correctPosition, onMove, register } = props;
  const reduced = usePrefersReducedMotion();
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id,
      transition: reduced ? null : { duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    });
  const answering = mode === "answer";
  const style = {
    transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
    transition: transition ?? undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-label={label}
      className={`option flex items-center gap-2 rounded-sm border bg-surface-1 px-2 py-2 sm:gap-3 sm:px-3 ${feedbackClasses[feedback]} ${
        isDragging ? "relative z-10 shadow-md" : ""
      }`}
    >
      {answering ? (
        <span
          ref={setActivatorNodeRef}
          {...listeners}
          aria-hidden="true"
          className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center self-stretch text-ink-2 sm:w-8"
        >
          <GripIcon />
        </span>
      ) : null}
      <span className="w-5 shrink-0 font-mono text-sm text-ink-2 tabular">{index + 1}</span>
      <span className="min-w-0 flex-1">
        {label}
        {correctPosition ? (
          <span className="block text-sm text-ink-2">Correct position: {correctPosition}</span>
        ) : null}
      </span>
      {feedback !== "neutral" ? (
        <>
          <span className="sr-only">{feedbackLabel[feedback]}</span>
          <FeedbackIcon state={feedback} className="" />
        </>
      ) : null}
      {answering ? (
        // Stacked on phones so the step's text keeps most of the row's width.
        <span className="flex shrink-0 flex-col gap-1 sm:flex-row">
          <MoveButton
            label={label}
            direction="up"
            disabled={index === 0}
            onMove={() => onMove(id, "up")}
            buttonRef={(el) => register(`${id}:up`, el)}
          />
          <MoveButton
            label={label}
            direction="down"
            disabled={index === count - 1}
            onMove={() => onMove(id, "down")}
            buttonRef={(el) => register(`${id}:down`, el)}
          />
        </span>
      ) : null}
    </li>
  );
}

interface MoveButtonProps {
  label: string;
  direction: Direction;
  disabled: boolean;
  onMove: () => void;
  buttonRef: (element: HTMLButtonElement | null) => void;
}

function MoveButton({ label, direction, disabled, onMove, buttonRef }: MoveButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-label={`Move "${label}" ${direction}`}
      disabled={disabled}
      onClick={onMove}
      className="tap-target inline-flex items-center justify-center rounded-sm border border-line text-ink-2 transition-[background-color,color] duration-fast ease-out-expo hover:bg-surface-2 hover:text-ink-1 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={direction === "down" ? "rotate-180" : ""}
      >
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  );
}

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      {[5, 12, 19].flatMap((y) =>
        [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.5" />),
      )}
    </svg>
  );
}

export const orderedResponseModule: ItemRendererModule<"ordered_response"> = {
  Renderer: OrderedResponseItem,
  isComplete: (item, response) => response.orderedIds.length === item.content.items.length,
  explainScore: (item) =>
    item.content.partial === "position"
      ? "Each step in its correct position earns a point."
      : "The whole order must be exact to earn the point.",
};
