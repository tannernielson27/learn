"use client";

import { DndContext, type DragEndEvent } from "@dnd-kit/core";
import { useId, useState, type KeyboardEvent } from "react";
import type { ResponseOf } from "@/lib/ngn/schemas";
import {
  DropSlot,
  SILENT_ANNOUNCEMENTS,
  useDragClickGuard,
  useTapToPlaceSensors,
  WordChip,
  type BankToken,
} from "../dragdrop/tapToPlace";
import { elementFeedback, type ItemRendererModule, type ItemRendererProps } from "../types";

type BowtieResponse = ResponseOf<"bowtie">;
type ColumnKey = "actions" | "condition" | "parameters";

interface Column {
  key: ColumnKey;
  label: string;
  choices: readonly BankToken[];
  /** Correct ids; empty outside feedback mode. */
  correct: readonly string[];
}

/** What each slot of a column holds, in slot order. */
export function slotsOf(response: BowtieResponse, key: ColumnKey): (string | undefined)[] {
  if (key === "condition") return [response.conditionId];
  const ids = key === "actions" ? response.actionIds : response.parameterIds;
  return [ids[0], ids[1]];
}

/**
 * A new response with one slot set or cleared. Pairs are stored as lists (order does not score),
 * so a pair with one empty slot keeps its choice in the first slot.
 */
export function withSlot(
  response: BowtieResponse,
  key: ColumnKey,
  index: number,
  tokenId: string | undefined,
): BowtieResponse {
  const next = slotsOf(response, key).map((id, i) => (i === index ? tokenId : id));
  const { actionIds, parameterIds } = response;
  if (key === "condition") {
    return next[0] === undefined
      ? { type: "bowtie", actionIds, parameterIds }
      : { ...response, conditionId: next[0] };
  }
  const filled = next.filter((id): id is string => id !== undefined);
  return key === "actions"
    ? { ...response, actionIds: filled }
    : { ...response, parameterIds: filled };
}

/**
 * The standalone Bowtie: 2 actions, 1 condition, 2 parameters, each column filled only from its
 * own choices. Same three ways in as drag-and-drop: mouse drag, long-press drag, or tap a choice
 * and then a slot (also the keyboard path).
 */
export function BowtieItem({ item, response, mode, onChange }: ItemRendererProps<"bowtie">) {
  const uid = useId();
  const [armed, setArmed] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const sensors = useTapToPlaceSensors();
  const guard = useDragClickGuard();
  const { actions, conditions, parameters, labels } = item.content;
  const key = item.answerKey;
  const columns: Column[] = [
    { key: "actions", label: labels.actions, choices: actions, correct: key?.actionIds ?? [] },
    {
      key: "condition",
      label: labels.condition,
      choices: conditions,
      correct: key ? [key.conditionId] : [],
    },
    {
      key: "parameters",
      label: labels.parameters,
      choices: parameters,
      correct: key?.parameterIds ?? [],
    },
  ];
  const columnOf = (tokenId: string) =>
    columns.find((c) => c.choices.some((t) => t.id === tokenId));
  const labelOf = (tokenId: string | undefined) =>
    columns.flatMap((c) => c.choices).find((t) => t.id === tokenId)?.label;
  const slotName = (column: Column, index: number) =>
    column.key === "condition" ? column.label : `${column.label} ${index + 1} of 2`;

  const place = (tokenId: string, column: Column, index: number) => {
    const home = columnOf(tokenId);
    if (!home || home.key !== column.key) {
      setMessage(`${labelOf(tokenId)} belongs in ${home?.label}, not ${column.label}.`);
      return;
    }
    const next = withSlot(response, column.key, index, tokenId);
    onChange(next);
    setArmed(null);
    setMessage(
      `${labelOf(tokenId)} placed in ${slotName(column, slotsOf(next, column.key).indexOf(tokenId))}.`,
    );
  };
  const chooseToken = (tokenId: string) => {
    if (guard.isDragging()) return;
    if (armed === tokenId) {
      setArmed(null);
      setMessage(`${labelOf(tokenId)} deselected.`);
      return;
    }
    const column = columnOf(tokenId);
    if (!column) return;
    const full = slotsOf(response, column.key).every((id) => id !== undefined);
    const which = column.key === "condition" ? "its slot" : "one of its slots";
    setArmed(tokenId);
    setMessage(
      full
        ? `${labelOf(tokenId)} selected. ${column.label} is full: choose ${which} to swap.`
        : `${labelOf(tokenId)} selected. Choose a slot in ${column.label}.`,
    );
  };
  const chooseSlot = (column: Column, index: number) => {
    if (armed) return place(armed, column, index);
    const current = slotsOf(response, column.key)[index];
    if (!current) return setMessage("Select a choice first, then choose a slot.");
    onChange(withSlot(response, column.key, index, undefined));
    setMessage(`${labelOf(current)} removed from ${slotName(column, index)}.`);
  };
  const cancelOnEscape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !armed) return;
    setArmed(null);
    setMessage("Selection cancelled.");
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    guard.end();
    if (!over) return;
    const [columnKey, index] = String(over.id).split(":");
    const column = columns.find((c) => c.key === columnKey);
    if (column) place(String(active.id), column, Number(index));
  };

  const placed = new Set(columns.flatMap((c) => slotsOf(response, c.key)));
  const armedColumn = armed ? columnOf(armed)?.key : undefined;

  return (
    <DndContext
      id={uid}
      sensors={sensors}
      onDragStart={guard.start}
      onDragEnd={onDragEnd}
      onDragCancel={guard.end}
      accessibility={{ announcements: SILENT_ANNOUNCEMENTS }}
    >
      <div className="grid gap-8 md:grid-cols-3 md:gap-x-12">
        {columns.map((column) => {
          const slots = slotsOf(response, column.key);
          const showCorrect =
            mode === "feedback" &&
            column.correct.length > 0 &&
            slots.some((id) => !id || !column.correct.includes(id));
          return (
            <section
              key={column.key}
              aria-labelledby={`${uid}-${column.key}`}
              className="flex min-w-0 flex-col gap-3"
            >
              <h3 id={`${uid}-${column.key}`} className="eyebrow">
                {column.label}
              </h3>
              <div className="relative flex flex-col justify-center gap-3 md:h-[10.75rem]">
                {column.key === "condition" ? <Connectors /> : null}
                {slots.map((id, index) => {
                  const label = labelOf(id);
                  const name = slotName(column, index);
                  return (
                    <DropSlot
                      key={index}
                      slotId={`${column.key}:${index}`}
                      name={`${name}${label ? `: ${label}` : ", empty"}`}
                      placeholder={column.key === "condition" ? "Condition" : `${index + 1}`}
                      label={label}
                      feedback={elementFeedback(
                        id !== undefined,
                        id !== undefined && column.correct.includes(id),
                        mode,
                      )}
                      mode={mode}
                      target={armedColumn === column.key}
                      block
                      onChoose={() => chooseSlot(column, index)}
                      onKeyDown={cancelOnEscape}
                    />
                  );
                })}
              </div>
              {showCorrect ? (
                <p className="text-sm text-ink-2">
                  Correct: {column.correct.map((id) => labelOf(id)).join("; ")}
                </p>
              ) : null}
              {mode === "answer" ? (
                <div
                  role="group"
                  aria-label={`${column.label} choices`}
                  className="flex flex-col gap-2 rounded-sm border border-line bg-surface-2 p-2"
                >
                  {column.choices
                    .filter((t) => !placed.has(t.id))
                    .map((t) => (
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
            </section>
          );
        })}
      </div>
      <p role="status" aria-label="Bowtie placement" className="sr-only">
        {message}
      </p>
    </DndContext>
  );
}

/** The bowtie's lines from the condition out to the action and parameter slots (768px and up). */
function Connectors() {
  const line = "M0 23 L48 50 M0 77 L48 50";
  return (
    <>
      <svg
        aria-hidden="true"
        viewBox="0 0 48 100"
        preserveAspectRatio="none"
        fill="none"
        className="absolute inset-y-0 -left-12 hidden h-full w-12 text-line-strong md:block"
      >
        <path d={line} stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <svg
        aria-hidden="true"
        viewBox="0 0 48 100"
        preserveAspectRatio="none"
        fill="none"
        className="absolute inset-y-0 -right-12 hidden h-full w-12 -scale-x-100 text-line-strong md:block"
      >
        <path d={line} stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
    </>
  );
}

export const bowtieModule: ItemRendererModule<"bowtie"> = {
  Renderer: BowtieItem,
  isComplete: (_item, response) =>
    response.actionIds.length === 2 &&
    response.conditionId !== undefined &&
    response.parameterIds.length === 2,
  explainScore: () =>
    "Each of the five slots earns a point; the order within a pair does not matter.",
};
