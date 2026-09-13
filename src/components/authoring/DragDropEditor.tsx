"use client";

import { useId, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import {
  fromDragdropClozeForm,
  fromDragdropRationaleForm,
  type DragDropFormValues,
} from "@/lib/authoring/forms/dragdrop";
import { describeIssues } from "@/lib/authoring/issueMessages";
import {
  dragdropClozeItemSchema,
  dragdropRationaleItemSchema,
  type ItemInputOf,
} from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";

type DragDropType = "dragdrop_cloze" | "dragdrop_rationale";

export interface DragDropEditorProps<T extends DragDropType = DragDropType> {
  type: T;
  initialValues: DragDropFormValues;
  onSaveDraft: (values: DragDropFormValues) => Promise<SaveResult>;
  onPublish: (item: ItemInputOf<T>) => Promise<SaveResult>;
}

// Limits from the schemas: 1 to 3 blanks (rationale 2 to 3), 4 to 8 words.
const MAX_BLANKS = 3;
const MIN_WORDS = 4;
const MAX_WORDS = 8;
const DIRTY = { shouldDirty: true } as const;
const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

function unusedId(prefix: string, taken: ReadonlySet<string>): string {
  for (let i = 1; i < 100; i += 1) {
    if (!taken.has(`${prefix}${i}`)) return `${prefix}${i}`;
  }
  return `${prefix}${Date.now()}`;
}

/**
 * Drag-and-drop cloze and rationale share one editor: the sentence works as in the drop-down cloze
 * editor ({{blankId}} markers, Insert blank, Remove blank), and every blank draws its answer from
 * one word bank. Fields are controlled from the form values, so removing a word or blank from the
 * middle never leaves another field showing old text.
 */
export function DragDropEditor<T extends DragDropType>({
  type,
  initialValues,
  onSaveDraft,
  onPublish,
}: DragDropEditorProps<T>) {
  const isRationale = type === "dragdrop_rationale";
  const minBlanks = isRationale ? 2 : 1;
  const { register, control, getValues, setValue, setFocus } = useForm<DragDropFormValues>({
    defaultValues: initialValues,
  });
  useWatch({ control });
  const ids = useId();
  const sentenceRef = useRef<HTMLTextAreaElement | null>(null);
  const sentenceField = register("sentence");

  const values = getValues();
  const toInput = (current: DragDropFormValues) =>
    (isRationale
      ? fromDragdropRationaleForm(current)
      : fromDragdropClozeForm(current)) as ItemInputOf<T>;
  const input = toInput(values);
  const parsed = isRationale
    ? dragdropRationaleItemSchema.safeParse(input)
    : dragdropClozeItemSchema.safeParse(input);
  const issues = parsed.success ? [] : describeIssues(parsed.error.issues, type);
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);

  function insertBlank() {
    const current = getValues();
    const blankId = unusedId("blank_", new Set(current.blanks.map((entry) => entry.id)));
    const element = sentenceRef.current;
    const start = element?.selectionStart ?? current.sentence.length;
    const end = element?.selectionEnd ?? start;
    const marker = `{{${blankId}}}`;
    setValue(
      "sentence",
      `${current.sentence.slice(0, start)}${marker}${current.sentence.slice(end)}`,
      DIRTY,
    );
    setValue(
      "blanks",
      [...current.blanks, { id: blankId, correctTokenId: "", rationale: "" }],
      DIRTY,
    );
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + marker.length, start + marker.length);
    });
  }

  function removeBlank(index: number) {
    const current = getValues();
    const blankId = current.blanks[index]?.id;
    if (!blankId) return;
    setValue("sentence", current.sentence.split(`{{${blankId}}}`).join(""), DIRTY);
    if (current.anchorBlankId === blankId) setValue("anchorBlankId", "", DIRTY);
    setValue(
      "blanks",
      current.blanks.filter((_, position) => position !== index),
      DIRTY,
    );
  }

  function addWord() {
    const current = getValues();
    const tokenId = unusedId("tok_", new Set(current.bank.map((token) => token.id)));
    setValue("bank", [...current.bank, { id: tokenId, label: "" }], DIRTY);
  }

  function removeWord(index: number) {
    const current = getValues();
    const tokenId = current.bank[index]?.id;
    setValue(
      "bank",
      current.bank.filter((_, position) => position !== index),
      DIRTY,
    );
    // A removed word can't stay any blank's answer.
    setValue(
      "blanks",
      current.blanks.map((entry) =>
        entry.correctTokenId === tokenId ? { ...entry, correctTokenId: "" } : entry,
      ),
      DIRTY,
    );
  }

  function focusField(field: string) {
    const word = /^bank\.(\d+)\.label$/.exec(field);
    const blankCorrect = /^blanks\.(\d+)\.correct$/.exec(field);
    if (field === "stem") setFocus("stem");
    else if (field === "sentence" || field === "blanks") sentenceRef.current?.focus();
    else if (word) document.getElementById(`${ids}-word-${word[1]}`)?.focus();
    else if (field === "bank") document.getElementById(`${ids}-word-0`)?.focus();
    else if (blankCorrect) document.getElementById(`${ids}-blank-${blankCorrect[1]}-word`)?.focus();
    else if (field === "anchorBlankId") document.getElementById(`${ids}-blank-0-anchor`)?.focus();
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
        {values.blanks.length < MAX_BLANKS ? (
          <div>
            <Button type="button" size="sm" onClick={insertBlank}>
              Insert blank
            </Button>
          </div>
        ) : null}
      </div>

      <fieldset aria-labelledby={`${ids}-bank-legend`} className="flex flex-col gap-3">
        <legend id={`${ids}-bank-legend`} className="text-sm font-medium text-ink-1">
          Word bank words
        </legend>
        {values.bank.map((token, index) => (
          <div key={token.id} className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor={`${ids}-word-${index}`} className="text-sm text-ink-1">
                Word {index + 1}
              </label>
              <input
                id={`${ids}-word-${index}`}
                type="text"
                className={`tap-target ${fieldClass}`}
                value={token.label}
                aria-invalid={hasIssue(`bank.${index}.label`) ? true : undefined}
                aria-describedby={describedBy(`bank.${index}.label`)}
                onChange={(event) => setValue(`bank.${index}.label`, event.target.value, DIRTY)}
              />
            </div>
            {values.bank.length > MIN_WORDS ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => removeWord(index)}>
                Remove word {index + 1}
              </Button>
            ) : null}
          </div>
        ))}
        {values.bank.length < MAX_WORDS ? (
          <div>
            <Button type="button" size="sm" onClick={addWord}>
              Add word
            </Button>
          </div>
        ) : null}
        <label className="tap-target flex items-center gap-2 text-base text-ink-1">
          <input
            type="checkbox"
            className="size-5 accent-accent"
            checked={values.reusable}
            onChange={(event) => setValue("reusable", event.target.checked, DIRTY)}
          />
          Let a word fill more than one blank
        </label>
      </fieldset>

      <div className="flex flex-col gap-4">
        {values.blanks.map((entry, index) => {
          const legendId = `${ids}-blank-${index}-legend`;
          return (
            <fieldset
              key={entry.id}
              aria-labelledby={legendId}
              className="flex flex-col gap-3 rounded-sm border border-line p-3"
            >
              <legend id={legendId} className="px-1 text-sm font-medium text-ink-1">
                Blank {index + 1}{" "}
                <span className="font-mono text-xs text-ink-2">{`{{${entry.id}}}`}</span>
              </legend>
              <label htmlFor={`${ids}-blank-${index}-word`} className="text-sm text-ink-1">
                Correct word for blank {index + 1}
              </label>
              <select
                id={`${ids}-blank-${index}-word`}
                className={`tap-target ${fieldClass}`}
                value={entry.correctTokenId}
                aria-invalid={hasIssue(`blanks.${index}.correct`) ? true : undefined}
                aria-describedby={describedBy(`blanks.${index}.correct`)}
                onChange={(event) =>
                  setValue(`blanks.${index}.correctTokenId`, event.target.value, DIRTY)
                }
              >
                <option value="">Choose a word</option>
                {values.bank.map((token, tokenIndex) => (
                  <option key={token.id} value={token.id}>
                    {token.label || `Word ${tokenIndex + 1} (no text yet)`}
                  </option>
                ))}
              </select>
              <label htmlFor={`${ids}-blank-${index}-why`} className="text-sm text-ink-2">
                Why this answer is right (optional)
              </label>
              <textarea
                id={`${ids}-blank-${index}-why`}
                rows={2}
                className={fieldClass}
                value={entry.rationale}
                onChange={(event) =>
                  setValue(`blanks.${index}.rationale`, event.target.value, DIRTY)
                }
              />
              {isRationale ? (
                <label className="tap-target flex items-center gap-2 text-sm text-ink-1">
                  <input
                    id={`${ids}-blank-${index}-anchor`}
                    type="radio"
                    name={`${ids}-anchor`}
                    className="size-5 accent-accent"
                    checked={values.anchorBlankId === entry.id}
                    onChange={() => setValue("anchorBlankId", entry.id, DIRTY)}
                  />
                  This blank is the anchor the others support
                </label>
              ) : null}
              {/* Also offered when the marker was typed away, so an orphaned blank can always go. */}
              {values.blanks.length > minBlanks || !values.sentence.includes(`{{${entry.id}}}`) ? (
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeBlank(index)}
                  >
                    Remove blank {index + 1}
                  </Button>
                </div>
              ) : null}
            </fieldset>
          );
        })}
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
