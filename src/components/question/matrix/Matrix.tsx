"use client";

import { useId } from "react";
import type { RichText } from "@/lib/ngn/schemas";
import { ElementRationale } from "../ElementRationale";
import { useFeedbackWordClass } from "../FeedbackWords";
import { FeedbackIcon, feedbackLabel } from "../OptionRow";
import type { ElementFeedback, PlayerMode } from "../types";

export interface MatrixAxisEntry {
  id: string;
  label: string;
}

export interface RowScore {
  points: number;
  maxPoints: number;
}

export interface MatrixProps {
  rows: readonly MatrixAxisEntry[];
  columns: readonly MatrixAxisEntry[];
  kind: "radio" | "checkbox";
  mode: PlayerMode;
  /** Visually hidden table caption; says how to answer. */
  caption: string;
  isSelected: (rowId: string, columnId: string) => boolean;
  feedbackFor: (rowId: string, columnId: string) => ElementFeedback;
  /** Per-row points, shown only when provided (feedback mode). */
  rowScore?: (rowId: string) => RowScore | undefined;
  /** Why the row scored as it did. Feedback mode only; the row is the scored element here. */
  rowRationale?: (rowId: string) => RichText | undefined;
  onToggle: (rowId: string, columnId: string) => void;
}

const cellFeedback: Record<ElementFeedback, string> = {
  neutral: "",
  correct: "border-correct bg-correct-soft",
  incorrect: "border-incorrect bg-incorrect-soft",
  missed: "border-dashed border-correct",
};

function stateClasses(checked: boolean, feedback: ElementFeedback, mode: PlayerMode): string {
  if (mode === "feedback") return cellFeedback[feedback];
  return checked ? "border-accent bg-accent-soft" : "";
}

/**
 * The verdict, as part of the control's name. The control has an explicit aria-labelledby, which
 * replaces any name from the label's content, so the verdict is only heard if this id is in that
 * list. It is hidden from the tree so it is not read again beside the control (#60).
 */
function FeedbackText({ id, state }: { id: string; state: ElementFeedback }) {
  const feedbackWordClass = useFeedbackWordClass();
  return state === "neutral" ? null : (
    <span id={id} aria-hidden="true" className={feedbackWordClass}>
      {feedbackLabel[state]}
    </span>
  );
}

/** aria-labelledby for a matrix control: row, column, then the verdict once there is one. */
function labelledBy(rowId: string, columnId: string, feedbackId: string, state: ElementFeedback) {
  return [rowId, columnId, state === "neutral" ? null : feedbackId].filter(Boolean).join(" ");
}

export function RowScoreMark({ score }: { score: RowScore }) {
  return (
    <span className="ml-2 font-mono text-xs whitespace-nowrap text-ink-2 tabular">
      <span className="sr-only">Row score </span>
      {score.points}/{score.maxPoints}
    </span>
  );
}

/**
 * Shared layout for matrix items. Both views are always rendered from the same response and
 * CSS shows one: a table at 768px and wider, one card per row below. Rotating a phone therefore
 * never loses an answer. Inputs in both views are named by their row and their column.
 */
export function Matrix(props: MatrixProps) {
  const uid = useId();
  return (
    <div>
      <MatrixGrid uid={uid} {...props} />
      <MatrixCards uid={uid} {...props} />
    </div>
  );
}

function MatrixGrid({
  uid,
  rows,
  columns,
  kind,
  mode,
  caption,
  isSelected,
  feedbackFor,
  rowScore,
  rowRationale,
  onToggle,
}: MatrixProps & { uid: string }) {
  const interactive = mode === "answer";
  return (
    // Padding cancelled by the margin, so the scroll box does not clip a control's focus ring.
    <div className="-m-1 hidden overflow-x-auto p-1 md:block">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <td className="w-2/5 border-b border-line-strong" />
            {columns.map((column) => (
              <th
                key={column.id}
                id={`${uid}-col-${column.id}`}
                scope="col"
                className="border-b border-line-strong px-2 pb-2 text-center align-bottom text-sm font-medium text-ink-2"
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const score = rowScore?.(row.id);
            const whyId = rowRationale?.(row.id) ? `${uid}-grid-why-${row.id}` : undefined;
            return (
              <tr key={row.id} className="border-b border-line">
                <th scope="row" className="option py-2 pr-4 text-left align-middle font-normal">
                  <span id={`${uid}-row-${row.id}`}>{row.label}</span>
                  {score ? <RowScoreMark score={score} /> : null}
                  <ElementRationale
                    id={`${uid}-grid-why-${row.id}`}
                    text={rowRationale?.(row.id)}
                  />
                </th>
                {columns.map((column) => {
                  const inputId = `${uid}-grid-${row.id}-${column.id}`;
                  const checked = isSelected(row.id, column.id);
                  const feedback = feedbackFor(row.id, column.id);
                  return (
                    <td key={column.id} className="p-1 align-middle">
                      <label
                        htmlFor={inputId}
                        className={`tap-target flex w-full items-center justify-center gap-1.5 rounded-sm border border-transparent transition-[background-color,border-color] duration-fast ease-out-expo ${
                          interactive ? "cursor-pointer hover:bg-surface-2" : "cursor-default"
                        } ${stateClasses(checked, feedback, mode)}`}
                      >
                        <input
                          id={inputId}
                          name={`${uid}-grid-${row.id}`}
                          type={kind}
                          checked={checked}
                          disabled={!interactive}
                          onChange={() => onToggle(row.id, column.id)}
                          aria-labelledby={labelledBy(
                            `${uid}-row-${row.id}`,
                            `${uid}-col-${column.id}`,
                            `${inputId}-verdict`,
                            feedback,
                          )}
                          aria-describedby={whyId}
                          className="size-4 accent-(--accent)"
                        />
                        <FeedbackText id={`${inputId}-verdict`} state={feedback} />
                        <FeedbackIcon state={feedback} className="" />
                      </label>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MatrixCards({
  uid,
  rows,
  columns,
  kind,
  mode,
  caption,
  isSelected,
  feedbackFor,
  rowScore,
  rowRationale,
  onToggle,
}: MatrixProps & { uid: string }) {
  const interactive = mode === "answer";
  return (
    <div className="flex flex-col gap-3 md:hidden">
      <p className="sr-only">{caption}</p>
      {rows.map((row) => {
        const score = rowScore?.(row.id);
        const whyId = rowRationale?.(row.id) ? `${uid}-card-why-${row.id}` : undefined;
        return (
          <fieldset
            key={row.id}
            className="min-w-0 rounded-sm border border-line bg-surface-1 px-3 pt-1 pb-3"
          >
            <legend
              id={`${uid}-card-row-${row.id}`}
              className="option float-left w-full py-2 font-medium"
            >
              {row.label}
            </legend>
            {score ? (
              <p className="clear-left -mt-1 mb-2 text-ink-2">
                <RowScoreMark score={score} />
              </p>
            ) : null}
            <ElementRationale
              id={`${uid}-card-why-${row.id}`}
              text={rowRationale?.(row.id)}
              className="clear-left mb-3"
            />
            <div className="clear-left flex flex-col divide-y divide-line overflow-hidden rounded-sm border border-line">
              {columns.map((column) => {
                const inputId = `${uid}-card-${row.id}-${column.id}`;
                const columnId = `${inputId}-column`;
                const checked = isSelected(row.id, column.id);
                const feedback = feedbackFor(row.id, column.id);
                return (
                  <label
                    key={column.id}
                    htmlFor={inputId}
                    className={`option tap-target flex items-center gap-3 border border-transparent px-3 py-2 transition-[background-color,border-color] duration-fast ease-out-expo ${
                      interactive ? "cursor-pointer hover:bg-surface-2" : "cursor-default"
                    } ${stateClasses(checked, feedback, mode)}`}
                  >
                    <input
                      id={inputId}
                      name={`${uid}-card-${row.id}`}
                      type={kind}
                      checked={checked}
                      disabled={!interactive}
                      onChange={() => onToggle(row.id, column.id)}
                      // Row and column, as in the grid: a phone screen reader can skip the
                      // group's name, and the column alone repeats identically on every card.
                      aria-labelledby={labelledBy(
                        `${uid}-card-row-${row.id}`,
                        columnId,
                        `${inputId}-verdict`,
                        feedback,
                      )}
                      aria-describedby={whyId}
                      className="size-4 shrink-0 accent-(--accent)"
                    />
                    {/* Hidden because the name already carries it; otherwise read twice. */}
                    <span id={columnId} aria-hidden="true" className="flex-1">
                      {column.label}
                    </span>
                    <FeedbackText id={`${inputId}-verdict`} state={feedback} />
                    <FeedbackIcon state={feedback} />
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
