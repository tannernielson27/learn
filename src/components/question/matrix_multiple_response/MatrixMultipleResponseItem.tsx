"use client";

import { Matrix } from "../matrix/Matrix";
import { rowScorer } from "../rowScore";
import { elementFeedback, type ItemRendererModule, type ItemRendererProps } from "../types";

export function MatrixMultipleResponseItem({
  item,
  response,
  mode,
  score,
  onChange,
}: ItemRendererProps<"matrix_multiple_response">) {
  const selected = new Map(response.rows.map((r) => [r.rowId, new Set(r.columnIds)]));
  const key = new Map(item.answerKey?.rows.map((r) => [r.rowId, r.correctColumnIds]) ?? []);
  const columnOrder = item.content.columns.map((c) => c.id);

  const toggle = (rowId: string, columnId: string) => {
    onChange({
      type: "matrix_multiple_response",
      rows: item.content.rows.flatMap((row) => {
        const current = selected.get(row.id) ?? new Set<string>();
        const flip = row.id === rowId;
        // Keep ids in column order so the response is stable however it was clicked.
        const columnIds = columnOrder.filter((id) =>
          flip && id === columnId ? !current.has(id) : current.has(id),
        );
        return columnIds.length > 0 ? [{ rowId: row.id, columnIds }] : [];
      }),
    });
  };

  const isSelected = (rowId: string, columnId: string) =>
    selected.get(rowId)?.has(columnId) ?? false;

  return (
    <Matrix
      rows={item.content.rows}
      columns={item.content.columns}
      kind="checkbox"
      mode={mode}
      caption="Select all that apply in each row."
      isSelected={isSelected}
      feedbackFor={(rowId, columnId) =>
        elementFeedback(
          isSelected(rowId, columnId),
          key.get(rowId)?.includes(columnId) ?? false,
          mode,
        )
      }
      rowRationale={(rowId) => item.rationale?.perElement?.[rowId]}
      rowScore={rowScorer(mode, score)}
      onToggle={toggle}
    />
  );
}

export const matrixMultipleResponseModule: ItemRendererModule<"matrix_multiple_response"> = {
  Renderer: MatrixMultipleResponseItem,
  isComplete: (item, response) =>
    item.content.rows.every((row) =>
      response.rows.some((r) => r.rowId === row.id && r.columnIds.length > 0),
    ),
};
