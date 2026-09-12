"use client";

import { useId, type ReactNode } from "react";
import { RowScoreMark, type RowScore } from "../matrix/Matrix";

export interface RowTableRow {
  id: string;
  label: string;
}

export interface RowControlContext {
  row: RowTableRow;
  view: "grid" | "card";
  /** Prefix unique to this row and view, for control ids and names. */
  idPrefix: string;
  /** Grid only: id of the row header's label text. */
  rowLabelId?: string;
  /** Grid only: id of the control column's header. */
  columnHeaderId?: string;
}

export interface RowTableProps {
  /** Visually hidden instruction: a table caption in the grid, a paragraph above the cards. */
  caption: string;
  /** Column headers: the row label column, then the control column. */
  headers: readonly [string, string];
  rows: readonly RowTableRow[];
  renderControl: (context: RowControlContext) => ReactNode;
  /** Per-row points, shown only when provided (feedback mode). */
  rowScore?: (rowId: string) => RowScore | undefined;
}

/**
 * Two-column layout for items with one control per row (drop-down table, response grouping).
 * Like the matrix, both views render from one response and CSS shows one: a table at 768px and
 * wider, one card per row below.
 */
export function RowTable({ caption, headers, rows, renderControl, rowScore }: RowTableProps) {
  const uid = useId();
  const columnHeaderId = `${uid}-control-col`;
  return (
    <div>
      {/* Padding cancelled by the margin, so the scroll box does not clip a control's focus ring. */}
      <div className="-m-1 hidden overflow-x-auto p-1 md:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="w-2/5 border-b border-line-strong pr-4 pb-2 text-sm font-medium text-ink-2"
              >
                {headers[0]}
              </th>
              <th
                scope="col"
                id={columnHeaderId}
                className="border-b border-line-strong pb-2 text-sm font-medium text-ink-2"
              >
                {headers[1]}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const score = rowScore?.(row.id);
              const rowLabelId = `${uid}-row-${row.id}`;
              return (
                <tr key={row.id} className="border-b border-line">
                  <th scope="row" className="option py-3 pr-4 text-left align-top font-normal">
                    <span id={rowLabelId}>{row.label}</span>
                    {score ? <RowScoreMark score={score} /> : null}
                  </th>
                  <td className="py-2 align-top">
                    {renderControl({
                      row,
                      view: "grid",
                      idPrefix: `${uid}-grid-${row.id}`,
                      rowLabelId,
                      columnHeaderId,
                    })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 md:hidden">
        <p className="sr-only">{caption}</p>
        {rows.map((row) => {
          const score = rowScore?.(row.id);
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
              <div className="clear-left">
                {renderControl({ row, view: "card", idPrefix: `${uid}-card-${row.id}` })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
