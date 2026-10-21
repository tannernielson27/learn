"use client";

import {
  closestCenter,
  DndContext,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { useSilentDndAccessibility } from "@/components/question/dndAccessibility";
import { usePrefersReducedMotion } from "@/components/question/usePrefersReducedMotion";
import { Button, PRESS_CLASSES } from "@/components/ui/Button";
import {
  moveEntry,
  moveEntryTo,
  orderChanged,
  positionMessage,
  QUIZ_ORDER_FIELD,
  type Direction,
  type QuizEntry,
} from "@/lib/authoring/quizOrder";

export type QuizOrderState =
  { status: "idle" } | { status: "error"; error: string } | { status: "done"; message: string };

export interface QuizOrderEditorProps {
  /** The quiz's current loose questions and case studies, in its saved order. */
  entries: readonly QuizEntry[];
  /** Saves the order the form holds, one `entry` field per id. */
  action: (state: QuizOrderState, formData: FormData) => Promise<QuizOrderState>;
}

const INITIAL: QuizOrderState = { status: "idle" };

/**
 * The Change order screen (#468): every question and case study of a quiz in one list, moved with
 * the up and down buttons (keyboard, screen reader, any pointer) or dragged by the grip, then saved
 * at once. Nothing is saved until Save order; the whole order goes in one call.
 */
export function QuizOrderEditor({ entries, action }: QuizOrderEditorProps) {
  const uid = useId();
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [saved, setSaved] = useState(() => entries.map((entry) => entry.id));
  const [order, setOrder] = useState(saved);
  const [message, setMessage] = useState("");
  // A save that went through is the new starting point; adjusted during render, not in an effect.
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.status === "done") setSaved(order);
  }
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const pendingFocus = useRef<string | null>(null);
  const dndA11y = useSilentDndAccessibility();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 100, tolerance: 6 } }),
  );
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const changed = orderChanged(saved, order);

  // Keyed rows move in the DOM when the order changes; put focus back on the moved entry's button.
  useEffect(() => {
    if (!pendingFocus.current) return;
    buttons.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });

  const announce = (next: string[], id: string) => {
    setOrder(next);
    setMessage(positionMessage(byId.get(id)?.label ?? "", next.indexOf(id), next.length));
  };
  const move = (id: string, direction: Direction) => {
    const next = moveEntry(order, id, direction);
    const at = next.indexOf(id);
    const sameStillEnabled = direction === "up" ? at > 0 : at < next.length - 1;
    pendingFocus.current = `${id}:${sameStillEnabled ? direction : direction === "up" ? "down" : "up"}`;
    announce(next, id);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    announce(moveEntryTo(order, String(active.id), String(over.id)), String(active.id));
  };
  const register = (key: string, element: HTMLButtonElement | null) => {
    if (element) buttons.current.set(key, element);
    else buttons.current.delete(key);
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {order.map((id) => (
        <input key={id} type="hidden" name={QUIZ_ORDER_FIELD} value={id} />
      ))}
      <DndContext
        id={uid}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        accessibility={dndA11y.accessibility}
      >
        <SortableContext items={order} strategy={verticalListSortingStrategy} disabled={pending}>
          <ol
            aria-label="Questions and case studies in order"
            className="flex flex-col divide-y divide-line border-y border-line"
          >
            {order.map((id, index) => {
              const entry = byId.get(id);
              if (!entry) return null;
              return (
                <EntryRow
                  key={id}
                  entry={entry}
                  index={index}
                  count={order.length}
                  locked={pending}
                  onMove={move}
                  register={register}
                />
              );
            })}
          </ol>
        </SortableContext>
        {dndA11y.sink}
      </DndContext>
      <p role="status" aria-label="Order changes" className="sr-only">
        {message}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button type="submit" variant="primary" disabled={pending || !changed}>
          Save order
        </Button>
        {changed && !pending ? (
          <p className="text-sm text-ink-2">Not saved yet.</p>
        ) : state.status === "done" ? (
          <p role="status" className="text-sm text-ink-1">
            {state.message}
          </p>
        ) : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-incorrect">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

interface EntryRowProps {
  entry: QuizEntry;
  index: number;
  count: number;
  /** While a save is in flight, so the order saved is the order shown. */
  locked: boolean;
  onMove: (id: string, direction: Direction) => void;
  register: (key: string, element: HTMLButtonElement | null) => void;
}

/** One entry. Pointer users drag it by the grip; everyone else moves it with the buttons. */
function EntryRow({ entry, index, count, locked, onMove, register }: EntryRowProps) {
  const reduced = usePrefersReducedMotion();
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: entry.id,
      transition: reduced ? null : { duration: 200, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    });
  const style = {
    transform: transform ? `translate3d(0, ${Math.round(transform.y)}px, 0)` : undefined,
    transition: transition ?? undefined,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 bg-surface-1 px-1 py-2 sm:gap-3 sm:px-2 ${
        isDragging ? "relative z-10 shadow-md" : ""
      }`}
    >
      <span
        ref={setActivatorNodeRef}
        {...listeners}
        aria-hidden="true"
        className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center self-stretch text-ink-2 sm:w-8"
      >
        <GripIcon />
      </span>
      <span className="w-7 shrink-0 font-mono text-sm text-ink-2 tabular">{index + 1}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="break-words text-ink-1">{entry.label}</span>
        <span className="flex flex-wrap gap-x-3 text-sm text-ink-2">
          <span>{entry.format}</span>
          <span>{entry.status}</span>
        </span>
      </div>
      {/* Stacked on phones so the entry's words keep most of the row's width. */}
      <span className="flex shrink-0 flex-col gap-1 sm:flex-row">
        <MoveButton
          label={entry.label}
          direction="up"
          disabled={locked || index === 0}
          onMove={() => onMove(entry.id, "up")}
          buttonRef={(element) => register(`${entry.id}:up`, element)}
        />
        <MoveButton
          label={entry.label}
          direction="down"
          disabled={locked || index === count - 1}
          onMove={() => onMove(entry.id, "down")}
          buttonRef={(element) => register(`${entry.id}:down`, element)}
        />
      </span>
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
      className={`tap-target inline-flex items-center justify-center rounded-sm border border-line text-ink-2 ${PRESS_CLASSES} hover:bg-surface-2 hover:text-ink-1 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
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
