"use client";

import { useId } from "react";
import type { RichText } from "@/lib/ngn/schemas";
import { ElementRationale } from "../ElementRationale";
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

function FeedbackText({ state }: { state: ElementFeedback }) {
  return state === "neutral" ? null : <span className="sr-only">{feedbackLabel[state]}</span>;
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
 * never loses an answer. Grid inputs are named by their row and column headers.
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
    <div className="hidden overflow-x-auto md:block">
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
                          aria-labelledby={`${uid}-row-${row.id} ${uid}-col-${column.id}`}
                          aria-describedby={whyId}
                          className="size-4 accent-(--accent)"
                        />
                        <FeedbackText state={feedback} />
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
            <legend className="option float-left w-full py-2 font-medium">{row.label}</legend>
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
                      aria-describedby={whyId}
                      className="size-4 shrink-0 accent-(--accent)"
                    />
                    <span className="flex-1">{column.label}</span>
                    <FeedbackText state={feedback} />
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
