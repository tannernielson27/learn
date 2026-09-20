"use client";

import { useId } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormRegister,
} from "react-hook-form";
import { Button } from "@/components/ui/Button";
import {
  fromDropdownTableForm,
  type DropdownTableFormValues,
} from "@/lib/authoring/forms/dropdownTable";
import { describeIssues } from "@/lib/authoring/issueMessages";
import { dropdownTableItemSchema, type ItemInputOf } from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";

export interface DropdownTableEditorProps {
  initialValues: DropdownTableFormValues;
  onSaveDraft: (values: DropdownTableFormValues) => Promise<SaveResult>;
  onPublish: (item: ItemInputOf<"dropdown_table">) => Promise<SaveResult>;
}

// Limits from the schema: 2 to 8 rows, 2 to 6 choices per row.
const MIN_ROWS = 2;
const MAX_ROWS = 8;
const MIN_CHOICES = 2;
const MAX_CHOICES = 6;

const letter = (index: number) => String.fromCharCode(65 + index);
const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

function unusedId(prefix: string, taken: ReadonlySet<string>): string {
  for (let i = 1; i < 100; i += 1) {
    if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
  }
  return `${prefix}${Date.now()}`;
}

const takenIds = (values: DropdownTableFormValues) =>
  new Set(values.rows.flatMap((row) => [row.id, ...row.choices.map((choice) => choice.id)]));

interface RowFieldsProps {
  control: Control<DropdownTableFormValues>;
  register: UseFormRegister<DropdownTableFormValues>;
  rowIndex: number;
  rowCount: number;
  ids: string;
  hasIssue: (field: string) => boolean;
  describedBy: (field: string) => string | undefined;
  readValues: () => DropdownTableFormValues;
  onClearCorrect: () => void;
  onRemove: () => void;
}

function RowFields({
  control,
  register,
  rowIndex,
  rowCount,
  ids,
  hasIssue,
  describedBy,
  readValues,
  onClearCorrect,
  onRemove,
}: RowFieldsProps) {
  const choices = useFieldArray({ control, name: `rows.${rowIndex}.choices`, keyName: "fieldKey" });
  const rowNumber = rowIndex + 1;
  const legendId = `${ids}-row-${rowIndex}-legend`;
  const correctField = `rows.${rowIndex}.correct`;

  return (
    <fieldset
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

      {choices.fields.map((field, choiceIndex) => {
        const L = letter(choiceIndex);
        const labelField = `rows.${rowIndex}.choices.${choiceIndex}.label`;
        return (
          <div key={field.fieldKey} className="flex flex-wrap items-center gap-3">
            <input
              type="radio"
              value={field.id}
              aria-label={`Choice ${L} is correct`}
              aria-describedby={describedBy(correctField)}
              className="size-5 accent-accent"
              {...register(`rows.${rowIndex}.correctChoiceId`)}
            />
            <label
              htmlFor={`${ids}-row-${rowIndex}-choice-${choiceIndex}`}
              className="w-20 shrink-0 text-sm text-ink-1"
            >
              Choice {L}
            </label>
            <input
              id={`${ids}-row-${rowIndex}-choice-${choiceIndex}`}
              type="text"
              className={`tap-target min-w-0 flex-1 ${fieldClass}`}
              aria-invalid={hasIssue(labelField) ? true : undefined}
              aria-describedby={describedBy(labelField)}
              {...register(`rows.${rowIndex}.choices.${choiceIndex}.label`)}
            />
            {choices.fields.length > MIN_CHOICES ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  // A removed choice can't stay the row's answer.
                  if (readValues().rows[rowIndex]?.correctChoiceId === field.id) onClearCorrect();
                  choices.remove(choiceIndex);
                }}
              >
                Remove choice {L} from row {rowNumber}
              </Button>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        {choices.fields.length < MAX_CHOICES ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const current = readValues();
              const rowId = current.rows[rowIndex]?.id ?? `row_${rowNumber}`;
              choices.append({ id: unusedId(`${rowId}_`, takenIds(current)), label: "" });
            }}
          >
            Add choice to row {rowNumber}
          </Button>
        ) : null}
        {rowCount > MIN_ROWS ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove row {rowNumber}
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}

export function DropdownTableEditor({
  initialValues,
  onSaveDraft,
  onPublish,
}: DropdownTableEditorProps) {
  const { register, control, getValues, setValue, setFocus } = useForm<DropdownTableFormValues>({
    defaultValues: initialValues,
  });
  const rows = useFieldArray({ control, name: "rows", keyName: "fieldKey" });
  useWatch({ control });
  const ids = useId();

  const values = getValues();
  const input = fromDropdownTableForm(values);
  const parsed = dropdownTableItemSchema.safeParse(input);
  const issues = parsed.success ? [] : describeIssues(parsed.error.issues, "dropdown_table");
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);

  function focusField(field: string) {
    const rowLabel = /^rows\.(\d+)\.label$/.exec(field);
    const choiceLabel = /^rows\.(\d+)\.choices\.(\d+)\.label$/.exec(field);
    const rowCorrect = /^rows\.(\d+)\.correct$/.exec(field);
    if (field === "stem") setFocus("stem");
    else if (field === "columnLabel") setFocus("columnLabel");
    else if (field === "dropdownLabel") setFocus("dropdownLabel");
    else if (field === "rows") setFocus("rows.0.label");
    else if (rowLabel) setFocus(`rows.${Number(rowLabel[1])}.label`);
    else if (choiceLabel)
      setFocus(`rows.${Number(choiceLabel[1])}.choices.${Number(choiceLabel[2])}.label`);
    else if (rowCorrect) setFocus(`rows.${Number(rowCorrect[1])}.correctChoiceId`);
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
      toInput={fromDropdownTableForm}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
      onRecordChange={(record) => setValue("ehr", record, { shouldDirty: true })}
      onTagsChange={(tags) => setValue("tags", tags, { shouldDirty: true })}
      onStepChange={(step) => setValue("cjmmStep", step, { shouldDirty: true })}
      rationaleField={register("rationaleGeneral")}
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${ids}-column-label`} className="text-sm font-medium text-ink-1">
            Row heading
          </label>
          <input
            id={`${ids}-column-label`}
            type="text"
            className={`tap-target ${fieldClass}`}
            aria-invalid={hasIssue("columnLabel") ? true : undefined}
            aria-describedby={describedBy("columnLabel")}
            {...register("columnLabel")}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${ids}-dropdown-label`} className="text-sm font-medium text-ink-1">
            Drop-down heading
          </label>
          <input
            id={`${ids}-dropdown-label`}
            type="text"
            className={`tap-target ${fieldClass}`}
            aria-invalid={hasIssue("dropdownLabel") ? true : undefined}
            aria-describedby={describedBy("dropdownLabel")}
            {...register("dropdownLabel")}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-ink-1">Rows</p>
        {rows.fields.map((field, rowIndex) => (
          <RowFields
            key={field.fieldKey}
            control={control}
            register={register}
            rowIndex={rowIndex}
            rowCount={rows.fields.length}
            ids={ids}
            hasIssue={hasIssue}
            describedBy={describedBy}
            readValues={getValues}
            onClearCorrect={() =>
              setValue(`rows.${rowIndex}.correctChoiceId`, "", { shouldDirty: true })
            }
            onRemove={() => rows.remove(rowIndex)}
          />
        ))}
        {rows.fields.length < MAX_ROWS ? (
          <div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const rowId = unusedId("row_", takenIds(getValues()));
                rows.append({
                  id: rowId,
                  label: "",
                  choices: [
                    { id: `${rowId}_a`, label: "" },
                    { id: `${rowId}_b`, label: "" },
                  ],
                  correctChoiceId: "",
                });
              }}
            >
              Add row
            </Button>
          </div>
        ) : null}
      </div>
    </EditorShell>
  );
}
