"use client";

import { useId } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import {
  fromMultipleResponseForm,
  type MultipleResponseFormValues,
} from "@/lib/authoring/forms/multipleResponse";
import { describeIssues } from "@/lib/authoring/issueMessages";
import { multipleResponseItemSchema, type ItemInputOf } from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";

export interface MultipleResponseEditorProps {
  initialValues: MultipleResponseFormValues;
  onSaveDraft: (values: MultipleResponseFormValues) => Promise<SaveResult>;
  onPublish: (item: ItemInputOf<"multiple_response">) => Promise<SaveResult>;
}

const MIN_OPTIONS = 5;
const MAX_OPTIONS = 10;
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

export function MultipleResponseEditor({
  initialValues,
  onSaveDraft,
  onPublish,
}: MultipleResponseEditorProps) {
  const { register, control, getValues, setValue, setFocus } = useForm<MultipleResponseFormValues>({
    defaultValues: initialValues,
  });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
    keyName: "fieldKey",
  });
  useWatch({ control });
  const ids = useId();

  const values = getValues();
  const input = fromMultipleResponseForm(values);
  const parsed = multipleResponseItemSchema.safeParse(input);
  const issues = parsed.success
    ? []
    : describeIssues(parsed.error.issues, "multiple_response", { n: values.n ?? undefined });
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);

  function focusField(field: string) {
    if (field === "stem") setFocus("stem");
    else if (field === "n") setFocus("n");
    else if (field === "correctOptionIds") setFocus("options.0.correct");
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
      toInput={fromMultipleResponseForm}
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

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-ink-1">Answer style</legend>
        <label className="tap-target flex items-center gap-3 text-base text-ink-1">
          <input
            type="radio"
            value="sata"
            className="size-5 accent-accent"
            {...register("variant")}
          />
          Select all that apply
        </label>
        <label className="tap-target flex items-center gap-3 text-base text-ink-1">
          <input
            type="radio"
            value="select_n"
            className="size-5 accent-accent"
            {...register("variant")}
          />
          Select a set number
        </label>
        {values.variant === "select_n" ? (
          <div className="flex items-center gap-3 pl-8">
            <label htmlFor={`${ids}-n`} className="text-sm text-ink-1">
              How many to select
            </label>
            <input
              id={`${ids}-n`}
              type="number"
              min={1}
              max={MAX_OPTIONS - 1}
              className={`tap-target w-20 ${fieldClass}`}
              aria-invalid={hasIssue("n") ? true : undefined}
              aria-describedby={describedBy("n")}
              {...register("n", {
                // A blank or unreadable count is null, never NaN, so the draft still saves.
                setValueAs: (value: unknown) => {
                  if (value === "" || value === null || value === undefined) return null;
                  const count = Number(value);
                  return Number.isFinite(count) ? count : null;
                },
              })}
            />
          </div>
        ) : null}
      </fieldset>

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
                  type="checkbox"
                  aria-label={`Option ${L} is correct`}
                  aria-describedby={describedBy("correctOptionIds")}
                  className="size-5 accent-accent"
                  {...register(`options.${index}.correct`)}
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
                Why option {L} is right or wrong (optional)
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
                append({
                  id: nextOptionId(getValues().options),
                  label: "",
                  correct: false,
                  rationale: "",
                })
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
