"use client";

import { Matrix } from "../matrix/Matrix";
import { elementFeedback, type ItemRendererModule, type ItemRendererProps } from "../types";

export function MatrixMultipleChoiceItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"matrix_multiple_choice">) {
  const answers = new Map(response.rows.map((r) => [r.rowId, r.columnId]));
  const key = new Map(item.answerKey?.rows.map((r) => [r.rowId, r.correctColumnId]) ?? []);

  const choose = (rowId: string, columnId: string) => {
    const next = new Map(answers).set(rowId, columnId);
    onChange({
      type: "matrix_multiple_choice",
      rows: item.content.rows.flatMap((row) => {
        const picked = next.get(row.id);
        return picked ? [{ rowId: row.id, columnId: picked }] : [];
      }),
    });
  };

  return (
    <Matrix
      rows={item.content.rows}
      columns={item.content.columns}
      kind="radio"
      mode={mode}
      caption="Select one option in each row."
      isSelected={(rowId, columnId) => answers.get(rowId) === columnId}
      feedbackFor={(rowId, columnId) =>
        elementFeedback(answers.get(rowId) === columnId, key.get(rowId) === columnId, mode)
      }
      rowScore={
        mode === "feedback" && key.size > 0
          ? (rowId) => ({ points: answers.get(rowId) === key.get(rowId) ? 1 : 0, maxPoints: 1 })
          : undefined
      }
      onToggle={choose}
    />
  );
}

export const matrixMultipleChoiceModule: ItemRendererModule<"matrix_multiple_choice"> = {
  Renderer: MatrixMultipleChoiceItem,
  isComplete: (item, response) =>
    item.content.rows.every((row) => response.rows.some((r) => r.rowId === row.id)),
};
