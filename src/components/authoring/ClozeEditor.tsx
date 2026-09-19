"use client";

import { useId, useRef } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormRegister,
} from "react-hook-form";
import { Button } from "@/components/ui/Button";
import {
  fromDropdownClozeForm,
  fromDropdownRationaleForm,
  type ClozeFormValues,
} from "@/lib/authoring/forms/cloze";
import { describeIssues } from "@/lib/authoring/issueMessages";
import {
  dropdownClozeItemSchema,
  dropdownRationaleItemSchema,
  type ItemInputOf,
} from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";

type ClozeType = "dropdown_cloze" | "dropdown_rationale";

export interface ClozeEditorProps<T extends ClozeType = ClozeType> {
  type: T;
  initialValues: ClozeFormValues;
  onSaveDraft: (values: ClozeFormValues) => Promise<SaveResult>;
  onPublish: (item: ItemInputOf<T>) => Promise<SaveResult>;
}

// Limits from the schemas: drop-down cloze 1 to 3 blanks, rationale 2 to 3; 3 to 5 choices each.
const MIN_CHOICES = 3;
const MAX_CHOICES = 5;
const letter = (index: number) => String.fromCharCode(65 + index);
const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

function unusedBlankId(taken: ReadonlySet<string>): string {
  for (let i = 1; i < 100; i += 1) {
    if (!taken.has(`blank_${i}`)) return `blank_${i}`;
  }
  return `blank_${Date.now()}`;
}

interface BlankFieldsProps {
  control: Control<ClozeFormValues>;
  register: UseFormRegister<ClozeFormValues>;
  blankIndex: number;
  blankId: string;
  canRemove: boolean;
  isRationale: boolean;
  ids: string;
  hasIssue: (field: string) => boolean;
  describedBy: (field: string) => string | undefined;
  onRemoveChoice: (choiceId: string) => void;
  onRemove: () => void;
}

function BlankFields({
  control,
  register,
  blankIndex,
  blankId,
  canRemove,
  isRationale,
  ids,
  hasIssue,
  describedBy,
  onRemoveChoice,
  onRemove,
}: BlankFieldsProps) {
  const choices = useFieldArray({
    control,
    name: `blanks.${blankIndex}.choices`,
    keyName: "fieldKey",
  });
  const blankNumber = blankIndex + 1;
  const legendId = `${ids}-blank-${blankIndex}-legend`;
  const correctField = `blanks.${blankIndex}.correct`;

  return (
    <fieldset
      aria-labelledby={legendId}
      className="flex flex-col gap-3 rounded-sm border border-line p-3"
    >
      <legend id={legendId} className="px-1 text-sm font-medium text-ink-1">
        Blank {blankNumber} <span className="font-mono text-xs text-ink-2">{`{{${blankId}}}`}</span>
      </legend>

      {choices.fields.map((field, choiceIndex) => {
        const L = letter(choiceIndex);
        const labelField = `blanks.${blankIndex}.choices.${choiceIndex}.label`;
        return (
          <div key={field.fieldKey} className="flex flex-wrap items-center gap-3">
            <input
              type="radio"
              value={field.id}
              aria-label={`Choice ${L} is correct`}
              aria-describedby={describedBy(correctField)}
              className="size-5 accent-accent"
              {...register(`blanks.${blankIndex}.correctChoiceId`)}
            />
            <label
              htmlFor={`${ids}-blank-${blankIndex}-choice-${choiceIndex}`}
              className="w-20 shrink-0 text-sm text-ink-1"
            >
              Choice {L}
            </label>
            <input
              id={`${ids}-blank-${blankIndex}-choice-${choiceIndex}`}
              type="text"
              className={`tap-target min-w-0 flex-1 ${fieldClass}`}
              aria-invalid={hasIssue(labelField) ? true : undefined}
              aria-describedby={describedBy(labelField)}
              {...register(`blanks.${blankIndex}.choices.${choiceIndex}.label`)}
            />
            {choices.fields.length > MIN_CHOICES ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  // A removed choice can't stay the blank's answer.
                  onRemoveChoice(field.id);
                  choices.remove(choiceIndex);
                }}
              >
                Remove choice {L} from blank {blankNumber}
              </Button>
            ) : null}
          </div>
        );
      })}

      <label htmlFor={`${ids}-blank-${blankIndex}-why`} className="text-sm text-ink-2">
        Why this answer is right (optional)
      </label>
      <textarea
        id={`${ids}-blank-${blankIndex}-why`}
        rows={2}
        className={fieldClass}
        {...register(`blanks.${blankIndex}.rationale`)}
      />

      {isRationale ? (
        <label className="tap-target flex items-center gap-2 text-sm text-ink-1">
          <input
            type="radio"
            value={blankId}
            className="size-5 accent-accent"
            {...register("anchorBlankId")}
          />
          This blank is the anchor the others support
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {choices.fields.length < MAX_CHOICES ? (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              const used = new Set(choices.fields.map((choice) => choice.id));
              let suffix = 0;
              while (used.has(`${blankId}_${String.fromCharCode(97 + suffix)}`)) suffix += 1;
              choices.append({ id: `${blankId}_${String.fromCharCode(97 + suffix)}`, label: "" });
            }}
          >
            Add choice to blank {blankNumber}
          </Button>
        ) : null}
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove blank {blankNumber}
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}

/**
 * One editor for drop-down cloze and drop-down rationale. The sentence is plain text where each
 * blank appears as {{blankId}}; Insert blank adds a new blank at the cursor, and removing a blank
 * also removes its marker, so the sentence and the blank list never disagree.
 */
export function ClozeEditor<T extends ClozeType>({
  type,
  initialValues,
  onSaveDraft,
  onPublish,
}: ClozeEditorProps<T>) {
  const isRationale = type === "dropdown_rationale";
  const maxBlanks = 3;
  const minBlanks = isRationale ? 2 : 1;
  const { register, control, getValues, setValue, setFocus } = useForm<ClozeFormValues>({
    defaultValues: initialValues,
  });
  const blanks = useFieldArray({ control, name: "blanks", keyName: "fieldKey" });
  useWatch({ control });
  const ids = useId();
  const sentenceRef = useRef<HTMLTextAreaElement | null>(null);
  const sentenceField = register("sentence");

  const values = getValues();
  const toInput = (current: ClozeFormValues) =>
    (isRationale
      ? fromDropdownRationaleForm(current)
      : fromDropdownClozeForm(current)) as ItemInputOf<T>;
  const input = toInput(values);
  const parsed = isRationale
    ? dropdownRationaleItemSchema.safeParse(input)
    : dropdownClozeItemSchema.safeParse(input);
  const issues = parsed.success ? [] : describeIssues(parsed.error.issues, type);
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);

  function insertBlank() {
    const current = getValues();
    const blankId = unusedBlankId(new Set(current.blanks.map((entry) => entry.id)));
    const element = sentenceRef.current;
    const start = element?.selectionStart ?? current.sentence.length;
    const end = element?.selectionEnd ?? start;
    const marker = `{{${blankId}}}`;
    setValue(
      "sentence",
      `${current.sentence.slice(0, start)}${marker}${current.sentence.slice(end)}`,
      {
        shouldDirty: true,
      },
    );
    blanks.append({
      id: blankId,
      choices: ["a", "b", "c"].map((suffix) => ({ id: `${blankId}_${suffix}`, label: "" })),
      correctChoiceId: "",
      rationale: "",
    });
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + marker.length, start + marker.length);
    });
  }

  function removeBlank(index: number) {
    const current = getValues();
    const blankId = current.blanks[index]?.id;
    if (blankId) {
      setValue("sentence", current.sentence.split(`{{${blankId}}}`).join(""), {
        shouldDirty: true,
      });
      if (current.anchorBlankId === blankId) setValue("anchorBlankId", "", { shouldDirty: true });
    }
    blanks.remove(index);
  }

  function focusField(field: string) {
    const choiceLabel = /^blanks\.(\d+)\.choices\.(\d+)\.label$/.exec(field);
    const blankCorrect = /^blanks\.(\d+)\.correct$/.exec(field);
    if (field === "stem") setFocus("stem");
    else if (field === "sentence" || field === "blanks") sentenceRef.current?.focus();
    else if (field === "anchorBlankId") setFocus("anchorBlankId");
    else if (choiceLabel)
      setFocus(`blanks.${Number(choiceLabel[1])}.choices.${Number(choiceLabel[2])}.label`);
    else if (blankCorrect) setFocus(`blanks.${Number(blankCorrect[1])}.correctChoiceId`);
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
      rationaleField={register("rationaleGeneral")}
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

      <div className="flex flex-col gap-2">
        <label htmlFor={`${ids}-sentence`} className="text-sm font-medium text-ink-1">
          Sentence
        </label>
        <p id={`${ids}-sentence-help`} className="text-sm text-ink-2">
          Each blank appears as its name in double braces. Place the cursor and choose Insert blank.
        </p>
        <textarea
          id={`${ids}-sentence`}
          rows={3}
          className={`font-mono ${fieldClass}`}
          aria-invalid={hasIssue("sentence") ? true : undefined}
          aria-describedby={[`${ids}-sentence-help`, describedBy("sentence")]
            .filter(Boolean)
            .join(" ")}
          {...sentenceField}
          ref={(element) => {
            sentenceField.ref(element);
            sentenceRef.current = element;
          }}
        />
        {blanks.fields.length < maxBlanks ? (
          <div>
            <Button type="button" size="sm" onClick={insertBlank}>
              Insert blank
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {blanks.fields.map((field, blankIndex) => (
          <BlankFields
            key={field.fieldKey}
            control={control}
            register={register}
            blankIndex={blankIndex}
            blankId={values.blanks[blankIndex]?.id ?? field.id}
            canRemove={blanks.fields.length > minBlanks}
            isRationale={isRationale}
            ids={ids}
            hasIssue={hasIssue}
            describedBy={describedBy}
            onRemoveChoice={(choiceId) => {
              if (getValues().blanks[blankIndex]?.correctChoiceId === choiceId) {
                setValue(`blanks.${blankIndex}.correctChoiceId`, "", { shouldDirty: true });
              }
            }}
            onRemove={() => removeBlank(blankIndex)}
          />
        ))}
      </div>
    </EditorShell>
  );
}
