"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/Button";
import {
  fromOrderedResponseForm,
  moveStep,
  type OrderedResponseFormValues,
} from "@/lib/authoring/forms/orderedResponse";
import { describeIssues } from "@/lib/authoring/issueMessages";
import { orderedResponseItemSchema, type ItemInputOf } from "@/lib/ngn/schemas";
import { EditorShell, issueMessageId, type SaveResult } from "./EditorShell";

export interface OrderedResponseEditorProps {
  initialValues: OrderedResponseFormValues;
  onSaveDraft: (values: OrderedResponseFormValues) => Promise<SaveResult>;
  onPublish: (item: ItemInputOf<"ordered_response">) => Promise<SaveResult>;
}

// Limits from the schema: 4 to 6 steps.
const MIN_STEPS = 4;
const MAX_STEPS = 6;
const DIRTY = { shouldDirty: true } as const;
const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong aria-invalid:border-incorrect";

function unusedStepId(taken: ReadonlySet<string>): string {
  for (let i = 1; i < 100; i += 1) {
    if (!taken.has(`step_${i}`)) return `step_${i}`;
  }
  return `step_${Date.now()}`;
}

/**
 * Ordered response: the author writes the steps in their correct order, which is the key, and
 * moves them with Up and Down. Students see them scrambled, never starting in this order (#219).
 */
export function OrderedResponseEditor({
  initialValues,
  onSaveDraft,
  onPublish,
}: OrderedResponseEditorProps) {
  const { register, control, getValues, setValue, setFocus } = useForm<OrderedResponseFormValues>({
    defaultValues: initialValues,
  });
  useWatch({ control });
  const ids = useId();
  const [moveNote, setMoveNote] = useState("");
  // Where focus goes once a move has re-rendered: the moved step's button for the same direction.
  // A ref, not state: the effect below clears it without causing another render.
  const focusAfterMove = useRef<{ index: number; direction: "up" | "down" } | null>(null);

  const values = getValues();
  const input = fromOrderedResponseForm(values);
  const parsed = orderedResponseItemSchema.safeParse(input);
  const issues = parsed.success ? [] : describeIssues(parsed.error.issues, "ordered_response");
  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const describedBy = (field: string) => (hasIssue(field) ? issueMessageId(ids, field) : undefined);
  const stepId = (index: number) => `${ids}-step-${index}`;

  // Runs after every render; does nothing unless a move is waiting for its focus.
  useEffect(() => {
    const pending = focusAfterMove.current;
    if (!pending) return;
    focusAfterMove.current = null;
    const { index, direction } = pending;
    const other = direction === "up" ? "down" : "up";
    const usable = (id: string) => {
      const element = document.getElementById(id) as HTMLButtonElement | null;
      return element && !element.disabled ? element : null;
    };
    // Focus follows the step, so repeated presses keep moving it. At the top or bottom that
    // button is disabled, so focus goes to the step's other move button instead.
    const button =
      usable(`${ids}-step-${index}-${direction}`) ??
      usable(`${ids}-step-${index}-${other}`) ??
      document.getElementById(`${ids}-step-${index}`);
    button?.focus();
  });

  function move(index: number, offset: -1 | 1) {
    const current = getValues();
    const target = index + offset;
    if (target < 0 || target >= current.steps.length) return;
    focusAfterMove.current = { index: target, direction: offset < 0 ? "up" : "down" };
    setValue("steps", moveStep(current.steps, index, offset), DIRTY);
    setMoveNote(`Step moved to position ${target + 1}.`);
  }

  function addStep() {
    const current = getValues();
    const id = unusedStepId(new Set(current.steps.map((step) => step.id)));
    setValue("steps", [...current.steps, { id, label: "", rationale: "" }], DIRTY);
  }

  function removeStep(index: number) {
    const current = getValues();
    setValue(
      "steps",
      current.steps.filter((_, position) => position !== index),
      DIRTY,
    );
  }

  function focusField(field: string) {
    const step = /^steps\.(\d+)\.label$/.exec(field);
    if (field === "stem") setFocus("stem");
    else if (step) document.getElementById(stepId(Number(step[1])))?.focus();
    else document.getElementById(stepId(0))?.focus();
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
      toInput={fromOrderedResponseForm}
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

      <fieldset aria-labelledby={`${ids}-steps-legend`} className="flex flex-col gap-3">
        <legend id={`${ids}-steps-legend`} className="text-sm font-medium text-ink-1">
          Steps in the correct order
        </legend>
        <p className="text-sm text-ink-2">
          Students see these steps shuffled and put them back in this order.
        </p>
        <ol className="flex flex-col gap-3">
          {values.steps.map((step, index) => (
            <li key={step.id} className="flex flex-col gap-2 rounded-sm border border-line p-3">
              <label htmlFor={stepId(index)} className="text-sm text-ink-1">
                Step {index + 1}
              </label>
              <input
                id={stepId(index)}
                type="text"
                className={`tap-target ${fieldClass}`}
                value={step.label}
                aria-invalid={hasIssue(`steps.${index}.label`) ? true : undefined}
                aria-describedby={describedBy(`steps.${index}.label`)}
                onChange={(event) => setValue(`steps.${index}.label`, event.target.value, DIRTY)}
              />
              <label htmlFor={`${stepId(index)}-why`} className="text-sm text-ink-2">
                Why this step goes here (optional)
              </label>
              <textarea
                id={`${stepId(index)}-why`}
                rows={2}
                className={fieldClass}
                value={step.rationale}
                onChange={(event) =>
                  setValue(`steps.${index}.rationale`, event.target.value, DIRTY)
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  id={`${stepId(index)}-up`}
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  Move step {index + 1} up
                </Button>
                <Button
                  id={`${stepId(index)}-down`}
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={index === values.steps.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Move step {index + 1} down
                </Button>
                {values.steps.length > MIN_STEPS ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => removeStep(index)}>
                    Remove step {index + 1}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {values.steps.length < MAX_STEPS ? (
          <div>
            <Button type="button" size="sm" onClick={addStep}>
              Add step
            </Button>
          </div>
        ) : null}
        <p role="status" className="text-sm text-ink-2">
          {moveNote}
        </p>
      </fieldset>

      <label className="tap-target flex items-center gap-2 text-base text-ink-1">
        <input
          type="checkbox"
          className="size-5 accent-accent"
          checked={values.partialByPosition}
          onChange={(event) => setValue("partialByPosition", event.target.checked, DIRTY)}
        />
        Give a point for each step in the right place
      </label>
    </EditorShell>
  );
}
