"use client";

import { useId } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import {
  fromMatrixMultipleChoiceForm,
  fromMatrixMultipleResponseForm,
  type MatrixFormValues,
} from "@/lib/authoring/forms/matrix";
import { describeIssues } from "@/lib/authoring/issueMessages";
import {
  matrixMultipleChoiceItemSchema,
  matrixMultipleResponseItemSchema,
  type ItemInputOf,
} from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";

type MatrixType = "matrix_multiple_choice" | "matrix_multiple_response";

export interface MatrixEditorProps<T extends MatrixType = MatrixType> {
  type: T;
  initialValues: MatrixFormValues;
  onSaveDraft: (values: MatrixFormValues) => Promise<SaveResult>;
  onPublish: (item: ItemInputOf<T>) => Promise<SaveResult>;
}

// Limits from the schema: 2 to 8 rows, 2 to 4 columns.
const MIN_ROWS = 2;
const MAX_ROWS = 8;
const MIN_COLUMNS = 2;
const MAX_COLUMNS = 4;

const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

function unusedId(prefix: string, taken: ReadonlySet<string>): string {
  for (let i = 1; i < 100; i += 1) {
    if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
  }
  return `${prefix}${Date.now()}`;
}

const takenIds = (values: MatrixFormValues) =>
  new Set([...values.rows.map((row) => row.id), ...values.columns.map((column) => column.id)]);

/**
 * One editor for both matrix types. Matrix multiple choice marks one column per row with radios;
 * matrix multiple response marks any columns per row with checkboxes.
 */
export function MatrixEditor<T extends MatrixType>({
  type,
  initialValues,
  onSaveDraft,
  onPublish,
}: MatrixEditorProps<T>) {
  const single = type === "matrix_multiple_choice";
  const { register, control, getValues, setValue, setFocus } = useForm<MatrixFormValues>({
    defaultValues: initialValues,
  });
  const rows = useFieldArray({ control, name: "rows", keyName: "fieldKey" });
  const columns = useFieldArray({ control, name: "columns", keyName: "fieldKey" });
  useWatch({ control });
  const ids = useId();

  const values = getValues();
  const toInput = (current: MatrixFormValues) =>
    (single
      ? fromMatrixMultipleChoiceForm(current)
      : fromMatrixMultipleResponseForm(current)) as ItemInputOf<T>;
  const input = toInput(values);
  const parsed = single
    ? matrixMultipleChoiceItemSchema.safeParse(input)
    : matrixMultipleResponseItemSchema.safeParse(input);
  const issues = parsed.success ? [] : describeIssues(parsed.error.issues, type);
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);

  function toggleCell(rowIndex: number, columnId: string, checked: boolean) {
    const current = getValues(`rows.${rowIndex}.correctColumnIds`) ?? [];
    const next = single
      ? checked
        ? [columnId]
        : []
      : checked
        ? [...current.filter((id) => id !== columnId), columnId]
        : current.filter((id) => id !== columnId);
    setValue(`rows.${rowIndex}.correctColumnIds`, next, { shouldDirty: true });
  }

  function removeColumn(index: number) {
    const columnId = getValues(`columns.${index}.id`);
    // Drop the removed column from every row's answer, so no row keeps a mark that no longer exists.
    getValues("rows").forEach((row, rowIndex) => {
      if (row.correctColumnIds.includes(columnId)) {
        setValue(
          `rows.${rowIndex}.correctColumnIds`,
          row.correctColumnIds.filter((id) => id !== columnId),
          { shouldDirty: true },
        );
      }
    });
    columns.remove(index);
  }

  function focusField(field: string) {
    const rowLabel = /^rows\.(\d+)\.label$/.exec(field);
    const columnLabel = /^columns\.(\d+)\.label$/.exec(field);
    const rowCorrect = /^rows\.(\d+)\.correct$/.exec(field);
    if (field === "stem") setFocus("stem");
    else if (field === "rows") setFocus("rows.0.label");
    else if (field === "columns") setFocus("columns.0.label");
    else if (rowLabel) setFocus(`rows.${Number(rowLabel[1])}.label`);
    else if (columnLabel) setFocus(`columns.${Number(columnLabel[1])}.label`);
    else if (rowCorrect) document.getElementById(`${ids}-cell-${rowCorrect[1]}-0`)?.focus();
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
      toInput={toInput}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
      onRecordChange={(record) => setValue("ehr", record, { shouldDirty: true })}
      onTagsChange={(tags) => setValue("tags", tags, { shouldDirty: true })}
      onStepChange={(step) => setValue("cjmmStep", step, { shouldDirty: true })}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-stem`} className="text-sm font-medium text-ink-1">
          Question stem
        </label>
        <textarea
          id={`${ids}-stem`}
          rows={4}
          className={fieldClass}
          aria-invalid={hasIssue("stem") ? true : undefined}
          aria-describedby={describedBy("stem")}
          {...register("stem")}
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-ink-1">Columns</legend>
        {columns.fields.map((field, index) => (
          <div key={field.fieldKey} className="flex flex-wrap items-center gap-3">
            <label htmlFor={`${ids}-col-${index}`} className="w-24 shrink-0 text-sm text-ink-1">
              Column {index + 1}
            </label>
            <input
              id={`${ids}-col-${index}`}
              type="text"
              className={`tap-target min-w-0 flex-1 ${fieldClass}`}
              aria-invalid={hasIssue(`columns.${index}.label`) ? true : undefined}
              aria-describedby={describedBy(`columns.${index}.label`)}
              {...register(`columns.${index}.label`)}
            />
            {columns.fields.length > MIN_COLUMNS ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeColumn(index)}>
                Remove column {index + 1}
              </Button>
            ) : null}
          </div>
        ))}
        {columns.fields.length < MAX_COLUMNS ? (
          <div>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                columns.append({ id: unusedId("col_", takenIds(getValues())), label: "" })
              }
            >
              Add column
            </Button>
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-ink-1">Rows</p>
        {rows.fields.map((field, rowIndex) => {
          const rowNumber = rowIndex + 1;
          const legendId = `${ids}-row-${rowIndex}-legend`;
          const marked = values.rows[rowIndex]?.correctColumnIds ?? [];
          return (
            <fieldset
              key={field.fieldKey}
              aria-labelledby={legendId}
              className="flex flex-col gap-3 rounded-sm border border-line p-3"
            >
              <legend id={legendId} className="px-1 text-sm font-medium text-ink-1">
                Row {rowNumber}
              </legend>
              <label htmlFor={`${ids}-row-${rowIndex}`} className="text-sm text-ink-1">
                Row text
              </label>
              <input
                id={`${ids}-row-${rowIndex}`}
                type="text"
                className={`tap-target ${fieldClass}`}
                aria-invalid={hasIssue(`rows.${rowIndex}.label`) ? true : undefined}
                aria-describedby={describedBy(`rows.${rowIndex}.label`)}
                {...register(`rows.${rowIndex}.label`)}
              />
              <div
                role={single ? "radiogroup" : "group"}
                aria-label={`Correct ${single ? "column" : "columns"} for row ${rowNumber}`}
                aria-describedby={describedBy(`rows.${rowIndex}.correct`)}
                className="flex flex-wrap gap-3"
              >
                {values.columns.map((column, columnIndex) => (
                  <label
                    key={column.id}
                    className="tap-target flex items-center gap-2 text-sm text-ink-1"
                  >
                    <input
                      id={`${ids}-cell-${rowIndex}-${columnIndex}`}
                      type={single ? "radio" : "checkbox"}
                      name={`${ids}-row-${rowIndex}-correct`}
                      checked={marked.includes(column.id)}
                      onChange={(event) => toggleCell(rowIndex, column.id, event.target.checked)}
                      className="size-5 accent-accent"
                    />
                    {column.label || `Column ${columnIndex + 1}`}
                  </label>
                ))}
              </div>
              <label htmlFor={`${ids}-why-${rowIndex}`} className="text-sm text-ink-2">
                Why this answer is right (optional)
              </label>
              <textarea
                id={`${ids}-why-${rowIndex}`}
                rows={2}
                className={fieldClass}
                {...register(`rows.${rowIndex}.rationale`)}
              />
              {rows.fields.length > MIN_ROWS ? (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => rows.remove(rowIndex)}
                  >
                    Remove row {rowNumber}
                  </Button>
                </div>
              ) : null}
            </fieldset>
          );
        })}
        {rows.fields.length < MAX_ROWS ? (
          <div>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                rows.append({
                  id: unusedId("row_", takenIds(getValues())),
                  label: "",
                  correctColumnIds: [],
                  rationale: "",
                })
              }
            >
              Add row
            </Button>
          </div>
        ) : null}
      </div>

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
