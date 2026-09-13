"use client";

import { useId, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import {
  fromHighlightTextForm,
  highlightWarning,
  markSpan,
  pruneAnswers,
  spansInText,
  takenSpanIds,
  unmarkSpan,
  type HighlightTextFormValues,
} from "@/lib/authoring/forms/highlight";
import { describeIssues } from "@/lib/authoring/issueMessages";
import { highlightTextItemSchema, type ItemInputOf } from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";
import { HighlightSpanList } from "./HighlightSpanList";

export interface HighlightTextEditorProps {
  initialValues: HighlightTextFormValues;
  onSaveDraft: (values: HighlightTextFormValues) => Promise<SaveResult>;
  onPublish: (item: ItemInputOf<"highlight_text">) => Promise<SaveResult>;
}

const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";
const DIRTY = { shouldDirty: true } as const;

/**
 * Highlight text: the passage is plain text where each selectable phrase is written as
 * [[phrase|id]]. Mark span wraps the selected phrase; the list below sets each phrase's answer.
 */
export function HighlightTextEditor({
  initialValues,
  onSaveDraft,
  onPublish,
}: HighlightTextEditorProps) {
  const { register, control, getValues, setValue, setFocus } = useForm<HighlightTextFormValues>({
    defaultValues: initialValues,
  });
  useWatch({ control });
  const ids = useId();
  const passageRef = useRef<HTMLTextAreaElement | null>(null);
  const passageField = register("passage");
  const [markNote, setMarkNote] = useState("");

  const values = getValues();
  const input = fromHighlightTextForm(values);
  const parsed = highlightTextItemSchema.safeParse(input);
  const issues = parsed.success ? [] : describeIssues(parsed.error.issues, "highlight_text");
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);

  const spans = spansInText(values.passage);
  const markedCorrect = values.correctSpanIds.filter((id) => spans.some((span) => span.id === id));
  const warning = highlightWarning(spans.length, markedCorrect.length);

  function markSelection() {
    const current = getValues();
    const element = passageRef.current;
    const result = markSpan(
      current.passage,
      element?.selectionStart ?? 0,
      element?.selectionEnd ?? 0,
      takenSpanIds(spansInText(current.passage), current),
    );
    if (!result) {
      setMarkNote("Select a phrase in the passage first. It cannot overlap another span.");
      return;
    }
    setMarkNote(`Marked a span. Choose whether it is correct below.`);
    setValue("passage", result.text, DIRTY);
  }

  function removeSpan(spanId: string) {
    const current = getValues();
    const passage = unmarkSpan(current.passage, spanId);
    const pruned = pruneAnswers(current, new Set(spansInText(passage).map((span) => span.id)));
    setValue("passage", passage, DIRTY);
    setValue("correctSpanIds", pruned.correctSpanIds, DIRTY);
    setValue("spanRationales", pruned.spanRationales, DIRTY);
  }

  function toggleCorrect(spanId: string, correct: boolean) {
    const current = getValues();
    const chosen = new Set(current.correctSpanIds);
    // Kept in reading order, and limited to spans still in the passage.
    const next = spansInText(current.passage)
      .map((span) => span.id)
      .filter((id) => (id === spanId ? correct : chosen.has(id)));
    setValue("correctSpanIds", next, DIRTY);
  }

  function focusField(field: string) {
    if (field === "stem") setFocus("stem");
    else passageRef.current?.focus();
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
      toInput={fromHighlightTextForm}
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
        <label htmlFor={`${ids}-passage`} className="text-sm font-medium text-ink-1">
          Passage
        </label>
        <p id={`${ids}-passage-help`} className="text-sm text-ink-2">
          Select a phrase and choose Mark span. A span is written as [[phrase|id]].
        </p>
        <textarea
          id={`${ids}-passage`}
          rows={6}
          className={fieldClass}
          aria-invalid={hasIssue("passage") ? true : undefined}
          aria-describedby={[`${ids}-passage-help`, describedBy("passage")]
            .filter(Boolean)
            .join(" ")}
          {...passageField}
          ref={(element) => {
            passageField.ref(element);
            passageRef.current = element;
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          {/* Pressing the button must not clear the textarea's selection before it is read. */}
          <Button
            type="button"
            size="sm"
            onMouseDown={(event) => event.preventDefault()}
            onClick={markSelection}
          >
            Mark span
          </Button>
          <p role="status" className="text-sm text-ink-2">
            {markNote}
          </p>
        </div>
      </div>

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
