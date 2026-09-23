"use client";

import { OptionRow } from "../OptionRow";
import { rowScorer } from "../rowScore";
import { RowTable, type RowControlContext } from "../row_table/RowTable";
import { elementFeedback, type ItemRendererProps, type PlayerMode } from "../types";

interface GroupOptionsProps {
  context: RowControlContext;
  options: readonly { id: string; label: string }[];
  selected: ReadonlySet<string>;
  correct: readonly string[];
  mode: PlayerMode;
  onToggle: (optionId: string) => void;
}

/** A row's checkboxes. In the grid they form a group named by the row header. */
function GroupOptions({ context, options, selected, correct, mode, onToggle }: GroupOptionsProps) {
  const rows = options.map((option) => {
    const isSelected = selected.has(option.id);
    return (
      <OptionRow
        key={option.id}
        id={`${context.idPrefix}-${option.id}`}
        name={context.idPrefix}
        kind="checkbox"
        label={option.label}
        checked={isSelected}
        mode={mode}
        feedback={elementFeedback(isSelected, correct.includes(option.id), mode)}
        onToggle={() => onToggle(option.id)}
      />
    );
  });
  return context.view === "grid" ? (
    <div role="group" aria-labelledby={context.rowLabelId} className="flex flex-col gap-2">
      {rows}
    </div>
  ) : (
    <div className="flex flex-col gap-2">{rows}</div>
  );
}

export function MultipleResponseGroupingItem({
  item,
  response,
  mode,
  score,
  onChange,
}: ItemRendererProps<"multiple_response_grouping">) {
  const selected = new Map(response.rows.map((r) => [r.rowId, new Set(r.optionIds)]));
  const key = new Map(item.answerKey?.rows.map((r) => [r.rowId, r.correctOptionIds]) ?? []);

  const toggle = (rowId: string, optionId: string) =>
    onChange({
      type: "multiple_response_grouping",
      rows: item.content.rows.flatMap((row) => {
        const current = selected.get(row.id) ?? new Set<string>();
        const flip = row.id === rowId;
        // Keep ids in option order so the response is stable however it was clicked.
        const optionIds = row.options
          .map((o) => o.id)
          .filter((id) => (flip && id === optionId ? !current.has(id) : current.has(id)));
        return optionIds.length > 0 ? [{ rowId: row.id, optionIds }] : [];
      }),
    });

  return (
    <RowTable
      caption="Select all that apply in each row."
      headers={["Category", "Options"]}
      rows={item.content.rows}
      renderControl={(context) => (
        <GroupOptions
          context={context}
          options={item.content.rows.find((r) => r.id === context.row.id)?.options ?? []}
          selected={selected.get(context.row.id) ?? new Set()}
          correct={key.get(context.row.id) ?? []}
          mode={mode}
          onToggle={(optionId) => toggle(context.row.id, optionId)}
        />
      )}
      rowScore={rowScorer(mode, score)}
    />
  );
}
