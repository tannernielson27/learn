"use client";

import { FeedbackIcon, feedbackLabel } from "../OptionRow";
import { RowTable, type RowControlContext } from "../row_table/RowTable";
import {
  elementFeedback,
  type ElementFeedback,
  type ItemRendererProps,
  type PlayerMode,
} from "../types";

const feedbackClasses: Record<ElementFeedback, string> = {
  neutral: "",
  correct: "border-correct bg-correct-soft",
  incorrect: "border-incorrect bg-incorrect-soft",
  missed: "border-dashed border-correct",
};

interface RowSelectProps {
  context: RowControlContext;
  columnLabel: string;
  choices: readonly { id: string; label: string }[];
  value: string | undefined;
  correctId: string | undefined;
  mode: PlayerMode;
  onChoose: (choiceId: string | undefined) => void;
}

function RowSelect({
  context,
  columnLabel,
  choices,
  value,
  correctId,
  mode,
  onChoose,
}: RowSelectProps) {
  const feedback = elementFeedback(value !== undefined, value === correctId, mode);
  const stateClass =
    mode === "feedback"
      ? feedbackClasses[feedback]
      : value
        ? "border-accent bg-accent-soft"
        : "border-line-strong";
  const correctLabel = choices.find((c) => c.id === correctId)?.label;
  const inGrid = context.view === "grid";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <select
          id={`${context.idPrefix}-select`}
          aria-labelledby={inGrid ? `${context.rowLabelId} ${context.columnHeaderId}` : undefined}
          aria-label={inGrid ? undefined : columnLabel}
          value={value ?? ""}
          disabled={mode !== "answer"}
          onChange={(event) => onChoose(event.target.value || undefined)}
          className={`tap-target w-full min-w-0 rounded-sm border bg-surface-1 px-2 text-base text-ink-1 transition-[background-color,border-color] duration-fast ease-out-expo disabled:opacity-100 ${stateClass}`}
        >
          <option value="">Select…</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
        {feedback !== "neutral" ? (
          <>
            <span className="sr-only">{feedbackLabel[feedback]}</span>
            <FeedbackIcon state={feedback} className="" />
          </>
        ) : null}
      </div>
      {feedback === "incorrect" && correctLabel ? (
        <p className="text-sm text-ink-2">Correct answer: {correctLabel}</p>
      ) : null}
    </div>
  );
}

export function DropdownTableItem({
  item,
  response,
  mode,
  onChange,
}: ItemRendererProps<"dropdown_table">) {
  const answers = new Map(response.rows.map((r) => [r.rowId, r.choiceId]));
  const key = new Map(item.answerKey?.rows.map((r) => [r.rowId, r.correctChoiceId]) ?? []);
  const columnLabel = item.content.columns.dropdown;

  const choose = (rowId: string, choiceId: string | undefined) =>
    onChange({
      type: "dropdown_table",
      rows: item.content.rows.flatMap((row) => {
        const value = row.id === rowId ? choiceId : answers.get(row.id);
        return value ? [{ rowId: row.id, choiceId: value }] : [];
      }),
    });

  return (
    <RowTable
      caption="Select one option in each row."
      headers={[item.content.columns.label, columnLabel]}
      rows={item.content.rows}
      renderControl={(context) => (
        <RowSelect
          context={context}
          columnLabel={columnLabel}
          choices={item.content.rows.find((r) => r.id === context.row.id)?.choices ?? []}
          value={answers.get(context.row.id)}
          correctId={key.get(context.row.id)}
          mode={mode}
          onChoose={(choiceId) => choose(context.row.id, choiceId)}
        />
      )}
      rowScore={
        mode === "feedback" && key.size > 0
          ? (rowId) => ({ points: answers.get(rowId) === key.get(rowId) ? 1 : 0, maxPoints: 1 })
          : undefined
      }
    />
  );
}
