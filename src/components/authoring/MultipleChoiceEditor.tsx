"use client";

import { useId } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import {
  fromMultipleChoiceForm,
  type MultipleChoiceFormValues,
} from "@/lib/authoring/forms/multipleChoice";
import { describeIssues } from "@/lib/authoring/issueMessages";
import { multipleChoiceItemSchema, type ItemInputOf } from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";

export type { SaveResult };

export interface MultipleChoiceEditorProps {
  initialValues: MultipleChoiceFormValues;
  /** Stores the form as it is, complete or not. Never publishes. */
  onSaveDraft: (values: MultipleChoiceFormValues) => Promise<SaveResult>;
  /** Called only with schema-valid item input. */
  onPublish: (item: ItemInputOf<"multiple_choice">) => Promise<SaveResult>;
}

const MAX_OPTIONS = 6;
const MIN_OPTIONS = 4;
const letter = (index: number) => String.fromCharCode(65 + index);

const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

function nextOptionId(existing: readonly { id: string }[]): string {
  const taken = new Set(existing.map((option) => option.id));
  for (let i = 0; i < 26; i += 1) {
    const candidate = `opt_${String.fromCharCode(97 + i)}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `opt_${Date.now()}`;
}

export function MultipleChoiceEditor({
  initialValues,
  onSaveDraft,
  onPublish,
}: MultipleChoiceEditorProps) {
  const { register, control, getValues, setValue, setFocus } = useForm<MultipleChoiceFormValues>({
    defaultValues: initialValues,
  });
  // keyName keeps RHF's row key from overwriting each option's own `id`.
  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
    keyName: "fieldKey",
  });
  useWatch({ control }); // re-render on every change so the preview and problems stay current
  const ids = useId();

  const values = getValues();
  const input = fromMultipleChoiceForm(values);
  const parsed = multipleChoiceItemSchema.safeParse(input);
  const issues = parsed.success ? [] : describeIssues(parsed.error.issues, "multiple_choice");
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);

  function focusField(field: string) {
    if (field === "stem") setFocus("stem");
    else if (field === "correctOptionId") setFocus("correctOptionId");
    else if (/^options\.\d+\.label$/.test(field)) setFocus(field as `options.${number}.label`);
    else if (field === "options") setFocus("options.0.label");
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
      toInput={fromMultipleChoiceForm}
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

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-sm font-medium text-ink-1">Options</legend>
        {fields.map((field, index) => {
          const L = letter(index);
          const labelField = `options.${index}.label`;
          return (
            <div
              key={field.fieldKey}
              className="flex flex-col gap-2 rounded-sm border border-line p-3"
            >
              <div className="flex items-center gap-3">
                <input
                  type="radio"
                  value={field.id}
                  aria-label={`Option ${L} is correct`}
                  aria-describedby={describedBy("correctOptionId")}
                  className="size-5 accent-accent"
                  {...register("correctOptionId")}
                />
                <label
                  htmlFor={`${ids}-opt-${index}`}
                  className="w-16 shrink-0 text-sm font-medium text-ink-1"
                >
                  Option {L}
                </label>
                <input
                  id={`${ids}-opt-${index}`}
                  type="text"
                  className={`tap-target ${fieldClass}`}
                  aria-invalid={hasIssue(labelField) ? true : undefined}
                  aria-describedby={describedBy(labelField)}
                  {...register(`options.${index}.label`)}
                />
              </div>
              <label htmlFor={`${ids}-why-${index}`} className="text-sm text-ink-2">
                Why option {L} is right or wrong <span className="text-ink-2">(optional)</span>
              </label>
              <textarea
                id={`${ids}-why-${index}`}
                rows={2}
                className={fieldClass}
                {...register(`options.${index}.rationale`)}
              />
              {fields.length > MIN_OPTIONS ? (
                <div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                    Remove option {L}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {fields.length < MAX_OPTIONS ? (
          <div>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                append({ id: nextOptionId(getValues().options), label: "", rationale: "" })
              }
            >
              Add option
            </Button>
          </div>
        ) : null}
      </fieldset>

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
