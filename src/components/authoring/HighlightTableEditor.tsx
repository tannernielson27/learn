"use client";

import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import {
  fromHighlightTableForm,
  highlightWarning,
  markSpan,
  pruneAnswers,
  spansInTable,
  takenSpanIds,
  unmarkSpan,
  type HighlightTableFormValues,
} from "@/lib/authoring/forms/highlight";
import { describeIssues } from "@/lib/authoring/issueMessages";
import { highlightTableItemSchema, type ItemInputOf } from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";
import { HighlightSpanList } from "./HighlightSpanList";

export interface HighlightTableEditorProps {
  initialValues: HighlightTableFormValues;
  onSaveDraft: (values: HighlightTableFormValues) => Promise<SaveResult>;
  onPublish: (item: ItemInputOf<"highlight_table">) => Promise<SaveResult>;
}

// Limits from the schema: 2 to 4 columns, 1 to 8 rows.
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 4;
const MIN_ROWS = 1;
const MAX_ROWS = 8;

const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";
const DIRTY = { shouldDirty: true } as const;

type Rows = HighlightTableFormValues["rows"];

function unusedRowId(rows: Rows): string {
  const taken = new Set(rows.map((row) => row.id));
  for (let i = 1; i < 100; i += 1) {
    if (!taken.has(`row_${i}`)) return `row_${i}`;
  }
  return `row_${Date.now()}`;
}

/**
 * Highlight table: column headings, and a cell per row and column using the same [[phrase|id]]
 * markup as a passage. Columns, rows and cells are controlled from the form values, so removing a
 * column or row from the middle never leaves another field showing its old text.
 */
export function HighlightTableEditor({
  initialValues,
  onSaveDraft,
  onPublish,
}: HighlightTableEditorProps) {
  const { register, control, getValues, setValue, setFocus } = useForm<HighlightTableFormValues>({
    defaultValues: initialValues,
  });
  useWatch({ control });
  const ids = useId();
  const [markNote, setMarkNote] = useState("");

  const values = getValues();
  const input = fromHighlightTableForm(values);
  const parsed = highlightTableItemSchema.safeParse(input);
  const issues = parsed.success ? [] : describeIssues(parsed.error.issues, "highlight_table");
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);

  const spans = spansInTable(values);
  const markedCorrect = values.correctSpanIds.filter((id) => spans.some((span) => span.id === id));
  const warning = highlightWarning(spans.length, markedCorrect.length);
  const cellId = (row: number, column: number) => `${ids}-cell-${row}-${column}`;

  /** Writes new rows, then drops answers for any span they no longer contain. */
  function writeRows(rows: Rows) {
    const current = getValues();
    const pruned = pruneAnswers(current, new Set(spansInTable({ rows }).map((span) => span.id)));
    setValue("rows", rows, DIRTY);
    setValue("correctSpanIds", pruned.correctSpanIds, DIRTY);
    setValue("spanRationales", pruned.spanRationales, DIRTY);
  }

  function markInCell(row: number, column: number) {
    const current = getValues();
    const element = document.getElementById(cellId(row, column)) as HTMLTextAreaElement | null;
    const result = markSpan(
      current.rows[row]?.cells[column]?.text ?? "",
      element?.selectionStart ?? 0,
      element?.selectionEnd ?? 0,
      takenSpanIds(spansInTable(current), current),
    );
    if (!result) {
      setMarkNote("Select a phrase in that cell first. It cannot overlap another span.");
      return;
    }
    setMarkNote("Marked a span. Choose whether it is correct below.");
    setValue(`rows.${row}.cells.${column}.text`, result.text, DIRTY);
  }

  function addColumn() {
    const current = getValues();
    setValue("columns", [...current.columns, { label: "" }], DIRTY);
    setValue(
      "rows",
      current.rows.map((row) => ({ ...row, cells: [...row.cells, { text: "" }] })),
      DIRTY,
    );
  }

  function removeColumn(index: number) {
    const current = getValues();
    setValue(
      "columns",
      current.columns.filter((_, column) => column !== index),
      DIRTY,
    );
    writeRows(
      current.rows.map((row) => ({
        ...row,
        cells: row.cells.filter((_, column) => column !== index),
      })),
    );
  }

  function addRow() {
    const current = getValues();
    setValue(
      "rows",
      [
        ...current.rows,
        { id: unusedRowId(current.rows), cells: current.columns.map(() => ({ text: "" })) },
      ],
      DIRTY,
    );
  }

  function removeSpan(spanId: string) {
    const current = getValues();
    writeRows(
      current.rows.map((row) => ({
        ...row,
        cells: row.cells.map((cell) => ({ text: unmarkSpan(cell.text, spanId) })),
      })),
    );
  }

  function toggleCorrect(spanId: string, correct: boolean) {
    const current = getValues();
    const chosen = new Set(current.correctSpanIds);
    const next = spansInTable(current)
      .map((span) => span.id)
      .filter((id) => (id === spanId ? correct : chosen.has(id)));
    setValue("correctSpanIds", next, DIRTY);
  }

  function focusField(field: string) {
    const column = /^columns\.(\d+)\.label$/.exec(field);
    if (field === "stem") setFocus("stem");
    else if (column) document.getElementById(`${ids}-column-${column[1]}`)?.focus();
    else if (field === "columns") document.getElementById(`${ids}-column-0`)?.focus();
    else document.getElementById(cellId(0, values.columns.length > 1 ? 1 : 0))?.focus();
  }

  return (
    <EditorShell
      values={values}
      initialValues={initialValues}
      input={input}
      valid={parsed.success}
      issues={issues}
      issueIdPrefix={ids}
      focusField={focusField}
      readValues={getValues}
      toInput={fromHighlightTableForm}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
      onRecordChange={(record) => setValue("ehr", record, { shouldDirty: true })}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-stem`} className="text-sm font-medium text-ink-1">
          Question stem
        </label>
        <textarea
          id={`${ids}-stem`}
          rows={3}
          className={fieldClass}
          aria-invalid={hasIssue("stem") ? true : undefined}
          aria-describedby={describedBy("stem")}
          {...register("stem")}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-ink-1">Columns</legend>
        {values.columns.map((column, index) => (
          <div key={index} className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={`${ids}-column-${index}`} className="text-sm text-ink-1">
                Column {index + 1}
              </label>
              <input
                id={`${ids}-column-${index}`}
                type="text"
                className={`tap-target ${fieldClass}`}
                value={column.label}
                aria-invalid={hasIssue(`columns.${index}.label`) ? true : undefined}
                aria-describedby={describedBy(`columns.${index}.label`)}
                onChange={(event) => setValue(`columns.${index}.label`, event.target.value, DIRTY)}
              />
            </div>
            {values.columns.length > MIN_COLUMNS ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeColumn(index)}>
                Remove column {index + 1}
              </Button>
            ) : null}
          </div>
        ))}
        {values.columns.length < MAX_COLUMNS ? (
          <div>
            <Button type="button" size="sm" onClick={addColumn}>
              Add column
            </Button>
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-ink-1">Rows</p>
        <p className="text-sm text-ink-2">
          Select a phrase in a cell and choose Mark span. A span is written as [[phrase|id]].
        </p>
        {values.rows.map((row, rowIndex) => {
          const legendId = `${ids}-row-${rowIndex}-legend`;
          return (
            <fieldset
              key={row.id}
              aria-labelledby={legendId}
              className="flex flex-col gap-3 rounded-sm border border-line p-3"
            >
              <legend id={legendId} className="px-1 text-sm font-medium text-ink-1">
                Row {rowIndex + 1}
              </legend>
              {row.cells.map((cell, columnIndex) => (
                <div key={columnIndex} className="flex flex-col gap-1">
                  <label htmlFor={cellId(rowIndex, columnIndex)} className="text-sm text-ink-1">
                    Row {rowIndex + 1}, column {columnIndex + 1}
                  </label>
                  <textarea
                    id={cellId(rowIndex, columnIndex)}
                    rows={2}
                    className={fieldClass}
                    value={cell.text}
                    onChange={(event) =>
                      setValue(
                        `rows.${rowIndex}.cells.${columnIndex}.text`,
                        event.target.value,
                        DIRTY,
                      )
                    }
                  />
                  <div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => markInCell(rowIndex, columnIndex)}
                    >
                      Mark span in row {rowIndex + 1}, column {columnIndex + 1}
                    </Button>
                  </div>
                </div>
              ))}
              {values.rows.length > MIN_ROWS ? (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      writeRows(getValues().rows.filter((_, index) => index !== rowIndex))
                    }
                  >
                    Remove row {rowIndex + 1}
                  </Button>
                </div>
              ) : null}
            </fieldset>
          );
        })}
        {values.rows.length < MAX_ROWS ? (
          <div>
            <Button type="button" size="sm" onClick={addRow}>
              Add row
            </Button>
          </div>
        ) : null}
        <p role="status" className="text-sm text-ink-2">
          {markNote}
        </p>
      </div>

      <label className="tap-target flex items-center gap-2 text-base text-ink-1">
        <input
          type="checkbox"
          className="size-5 accent-accent"
          checked={values.scorePerRow}
          onChange={(event) => setValue("scorePerRow", event.target.checked, DIRTY)}
        />
        Score each row separately
      </label>

      <HighlightSpanList
        spans={spans}
        correctSpanIds={values.correctSpanIds}
        spanRationales={values.spanRationales}
        ids={ids}
        describedBy={describedBy("correctSpanIds")}
        onToggleCorrect={toggleCorrect}
        onRationaleChange={(spanId, text) =>
          setValue("spanRationales", { ...getValues().spanRationales, [spanId]: text }, DIRTY)
        }
        onRemove={removeSpan}
      />
      {warning ? <p className="text-sm text-ink-2">{warning}</p> : null}

      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-rationale`} className="text-sm font-medium text-ink-1">
          Rationale
        </label>
        <textarea
          id={`${ids}-rationale`}
          rows={3}
          className={fieldClass}
          {...register("rationaleGeneral")}
        />
      </div>
    </EditorShell>
  );
}
