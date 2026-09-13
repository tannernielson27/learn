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
  fromGroupingForm,
  type GroupingFormValues,
} from "@/lib/authoring/forms/multipleResponseGrouping";
import { describeIssues } from "@/lib/authoring/issueMessages";
import { multipleResponseGroupingItemSchema, type ItemInputOf } from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";

export interface GroupingEditorProps {
  initialValues: GroupingFormValues;
  onSaveDraft: (values: GroupingFormValues) => Promise<SaveResult>;
  onPublish: (item: ItemInputOf<"multiple_response_grouping">) => Promise<SaveResult>;
}

// Limits from the schema: 2 to 8 groups, 2 to 4 options per group.
const MIN_ROWS = 2;
const MAX_ROWS = 8;
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

const letter = (index: number) => String.fromCharCode(65 + index);
const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

function unusedId(base: string, taken: ReadonlySet<string>): string {
  for (let i = 1; i < 100; i += 1) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${Date.now()}`;
}

function allIds(values: GroupingFormValues): Set<string> {
  return new Set(values.rows.flatMap((row) => [row.id, ...row.options.map((option) => option.id)]));
}

interface GroupFieldsProps {
  control: Control<GroupingFormValues>;
  register: UseFormRegister<GroupingFormValues>;
  rowIndex: number;
  rowCount: number;
  ids: string;
  hasIssue: (field: string) => boolean;
  describedBy: (field: string) => string | undefined;
  readValues: () => GroupingFormValues;
  onRemove: () => void;
}

function GroupFields({
  control,
  register,
  rowIndex,
  rowCount,
  ids,
  hasIssue,
  describedBy,
  readValues,
  onRemove,
}: GroupFieldsProps) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `rows.${rowIndex}.options`,
    keyName: "fieldKey",
  });
  const groupNumber = rowIndex + 1;
  const nameField = `rows.${rowIndex}.label`;
  const correctField = `rows.${rowIndex}.correct`;
  const legendId = `${ids}-group-${rowIndex}`;

  return (
    <fieldset
      aria-labelledby={legendId}
      className="flex flex-col gap-3 rounded-sm border border-line p-3"
    >
      <legend id={legendId} className="px-1 text-sm font-medium text-ink-1">
        Group {groupNumber}
      </legend>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-group-${rowIndex}-name`} className="text-sm text-ink-1">
          Group name
        </label>
        <input
          id={`${ids}-group-${rowIndex}-name`}
          type="text"
          className={`tap-target ${fieldClass}`}
          aria-invalid={hasIssue(nameField) ? true : undefined}
          aria-describedby={describedBy(nameField)}
          {...register(`rows.${rowIndex}.label`)}
        />
      </div>

      {fields.map((field, optionIndex) => {
        const L = letter(optionIndex);
        const labelField = `rows.${rowIndex}.options.${optionIndex}.label`;
        return (
          <div key={field.fieldKey} className="flex flex-wrap items-center gap-3">
            <input
              type="checkbox"
              aria-label={`Option ${L} is correct`}
              aria-describedby={describedBy(correctField)}
              className="size-5 accent-accent"
              {...register(`rows.${rowIndex}.options.${optionIndex}.correct`)}
            />
            <label
              htmlFor={`${ids}-group-${rowIndex}-opt-${optionIndex}`}
              className="w-16 shrink-0 text-sm text-ink-1"
            >
              Option {L}
            </label>
            <input
              id={`${ids}-group-${rowIndex}-opt-${optionIndex}`}
              type="text"
              className={`tap-target min-w-0 flex-1 ${fieldClass}`}
              aria-invalid={hasIssue(labelField) ? true : undefined}
              aria-describedby={describedBy(labelField)}
              {...register(`rows.${rowIndex}.options.${optionIndex}.label`)}
            />
            {fields.length > MIN_OPTIONS ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => remove(optionIndex)}>
                Remove option {L} from group {groupNumber}
              </Button>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-2">
        {fields.length < MAX_OPTIONS ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const current = readValues();
              const rowId = current.rows[rowIndex]?.id ?? `row_${groupNumber}`;
              append({ id: unusedId(`${rowId}_`, allIds(current)), label: "", correct: false });
            }}
          >
            Add option to group {groupNumber}
          </Button>
        ) : null}
        {rowCount > MIN_ROWS ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove group {groupNumber}
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}

export function GroupingEditor({ initialValues, onSaveDraft, onPublish }: GroupingEditorProps) {
  const { register, control, getValues, setFocus } = useForm<GroupingFormValues>({
    defaultValues: initialValues,
  });
  const { fields, append, remove } = useFieldArray({ control, name: "rows", keyName: "fieldKey" });
  useWatch({ control });
  const ids = useId();

  const values = getValues();
  const input = fromGroupingForm(values);
  const parsed = multipleResponseGroupingItemSchema.safeParse(input);
  const issues = parsed.success
    ? []
    : describeIssues(parsed.error.issues, "multiple_response_grouping");
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);

  function focusField(field: string) {
    const correct = /^rows\.(\d+)\.correct$/.exec(field);
    const options = /^rows\.(\d+)\.options$/.exec(field);
    if (field === "stem") setFocus("stem");
    else if (field === "rows") setFocus("rows.0.label");
    else if (correct) setFocus(`rows.${Number(correct[1])}.options.0.correct`);
    else if (options) setFocus(`rows.${Number(options[1])}.options.0.label`);
    else if (/^rows\.\d+\.label$/.test(field)) setFocus(field as `rows.${number}.label`);
    else if (/^rows\.\d+\.options\.\d+\.label$/.test(field)) {
      setFocus(field as `rows.${number}.options.${number}.label`);
    }
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
      toInput={fromGroupingForm}
      onSaveDraft={onSaveDraft}
      onPublish={onPublish}
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

      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-instructions`} className="text-sm font-medium text-ink-1">
          Instructions <span className="font-normal text-ink-2">(optional)</span>
        </label>
        <input
          id={`${ids}-instructions`}
          type="text"
          className={`tap-target ${fieldClass}`}
          {...register("instructions")}
        />
      </div>

      <div className="flex flex-col gap-4">
        <p className="text-sm font-medium text-ink-1">Groups</p>
        {fields.map((field, rowIndex) => (
          <GroupFields
            key={field.fieldKey}
            control={control}
            register={register}
            rowIndex={rowIndex}
            rowCount={fields.length}
            ids={ids}
            hasIssue={hasIssue}
            describedBy={describedBy}
            readValues={getValues}
            onRemove={() => remove(rowIndex)}
          />
        ))}
        {fields.length < MAX_ROWS ? (
          <div>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const current = getValues();
                const taken = allIds(current);
                const rowId = unusedId("row_", taken);
                append({
                  id: rowId,
                  label: "",
                  options: [
                    { id: `${rowId}_a`, label: "", correct: false },
                    { id: `${rowId}_b`, label: "", correct: false },
                  ],
                });
              }}
            >
              Add group
            </Button>
          </div>
        ) : null}
      </div>
    </EditorShell>
  );
}
