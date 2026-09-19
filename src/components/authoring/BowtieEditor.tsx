"use client";

import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  fromBowtieForm,
  type BowtieChoiceForm,
  type BowtieFormValues,
} from "@/lib/authoring/forms/bowtie";
import { describeIssues } from "@/lib/authoring/issueMessages";
import { bowtieItemSchema, type ItemInputOf } from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";

export interface BowtieEditorProps {
  initialValues: BowtieFormValues;
  onSaveDraft: (values: BowtieFormValues) => Promise<SaveResult>;
  onPublish: (item: ItemInputOf<"bowtie">) => Promise<SaveResult>;
}

const DIRTY = { shouldDirty: true } as const;
const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

type PairColumn = "actions" | "parameters";

const PAIR_COLUMNS: Record<
  PairColumn,
  { noun: string; heading: keyof BowtieFormValues["columnLabels"] }
> = {
  actions: { noun: "Action", heading: "actions" },
  parameters: { noun: "Parameter", heading: "parameters" },
};

/**
 * Bowtie: five actions, four conditions and five parameters, fixed by the format. The author marks
 * the two correct actions and parameters with checkboxes and the one condition with a radio; the
 * column headings can be renamed.
 */
export function BowtieEditor({ initialValues, onSaveDraft, onPublish }: BowtieEditorProps) {
  const { register, control, getValues, setValue, setFocus } = useForm<BowtieFormValues>({
    defaultValues: initialValues,
  });
  useWatch({ control });
  const ids = useId();

  const values = getValues();
  const input = fromBowtieForm(values);
  const parsed = bowtieItemSchema.safeParse(input);
  const marked = (list: readonly BowtieChoiceForm[]) =>
    list.filter((choice) => choice.correct).length;
  const issues = parsed.success
    ? []
    : describeIssues(parsed.error.issues, "bowtie", {
        bowtieMarked: { actions: marked(values.actions), parameters: marked(values.parameters) },
      });
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);

  function focusField(field: string) {
    const choice = /^(actions|conditions|parameters)\.(\d+)\.label$/.exec(field);
    if (field === "stem") setFocus("stem");
    else if (choice) document.getElementById(`${ids}-${choice[1]}-${choice[2]}`)?.focus();
    else if (field === "actions" || field === "parameters") {
      document.getElementById(`${ids}-${field}-0-correct`)?.focus();
    } else if (field === "conditionId")
      document.getElementById(`${ids}-conditions-0-correct`)?.focus();
  }

  function pairColumn(column: PairColumn) {
    const { noun, heading } = PAIR_COLUMNS[column];
    const legendId = `${ids}-${column}-legend`;
    const count = marked(values[column]);
    return (
      <fieldset
        aria-labelledby={legendId}
        aria-describedby={describedBy(column)}
        className="flex flex-col gap-3 rounded-sm border border-line p-3"
      >
        <legend id={legendId} className="px-1 text-sm font-medium text-ink-1">
          {values.columnLabels[heading] || noun}
        </legend>
        <p className="text-sm text-ink-2">Mark the two correct ones. {count} of 2 marked.</p>
        {values[column].map((choice, index) => (
          <div key={choice.id} className="flex flex-wrap items-center gap-3">
            <input
              id={`${ids}-${column}-${index}-correct`}
              type="checkbox"
              className="size-5 accent-accent"
              aria-label={`${noun} ${index + 1} is correct`}
              checked={choice.correct}
              onChange={(event) =>
                setValue(`${column}.${index}.correct`, event.target.checked, DIRTY)
              }
            />
            <label
              htmlFor={`${ids}-${column}-${index}`}
              className="w-24 shrink-0 text-sm text-ink-1"
            >
              {noun} {index + 1}
            </label>
            <input
              id={`${ids}-${column}-${index}`}
              type="text"
              className={`tap-target min-w-0 flex-1 ${fieldClass}`}
              value={choice.label}
              aria-invalid={hasIssue(`${column}.${index}.label`) ? true : undefined}
              aria-describedby={describedBy(`${column}.${index}.label`)}
              onChange={(event) => setValue(`${column}.${index}.label`, event.target.value, DIRTY)}
            />
          </div>
        ))}
      </fieldset>
    );
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
      toInput={fromBowtieForm}
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

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1 text-sm font-medium text-ink-1">Column headings</legend>
        {(
          [
            ["actions", "Actions heading"],
            ["condition", "Condition heading"],
            ["parameters", "Parameters heading"],
          ] as const
        ).map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            <label htmlFor={`${ids}-heading-${key}`} className="text-sm text-ink-1">
              {label}
            </label>
            <input
              id={`${ids}-heading-${key}`}
              type="text"
              className={`tap-target ${fieldClass}`}
              value={values.columnLabels[key]}
              onChange={(event) => setValue(`columnLabels.${key}`, event.target.value, DIRTY)}
            />
          </div>
        ))}
      </fieldset>

      {pairColumn("actions")}

      <fieldset
        aria-labelledby={`${ids}-conditions-legend`}
        aria-describedby={describedBy("conditionId")}
        className="flex flex-col gap-3 rounded-sm border border-line p-3"
      >
        <legend id={`${ids}-conditions-legend`} className="px-1 text-sm font-medium text-ink-1">
          {values.columnLabels.condition || "Condition"}
        </legend>
        <p className="text-sm text-ink-2">Mark the one correct condition.</p>
        {values.conditions.map((choice, index) => (
          <div key={choice.id} className="flex flex-wrap items-center gap-3">
            <input
              id={`${ids}-conditions-${index}-correct`}
              type="radio"
              name={`${ids}-condition`}
              className="size-5 accent-accent"
              aria-label={`Condition ${index + 1} is correct`}
              checked={values.conditionId === choice.id}
              onChange={() => setValue("conditionId", choice.id, DIRTY)}
            />
            <label
              htmlFor={`${ids}-conditions-${index}`}
              className="w-24 shrink-0 text-sm text-ink-1"
            >
              Condition {index + 1}
            </label>
            <input
              id={`${ids}-conditions-${index}`}
              type="text"
              className={`tap-target min-w-0 flex-1 ${fieldClass}`}
              value={choice.label}
              aria-invalid={hasIssue(`conditions.${index}.label`) ? true : undefined}
              aria-describedby={describedBy(`conditions.${index}.label`)}
              onChange={(event) => setValue(`conditions.${index}.label`, event.target.value, DIRTY)}
            />
          </div>
        ))}
      </fieldset>

      {pairColumn("parameters")}

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
