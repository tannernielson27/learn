"use client";

import { useEffect, useId, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { Button } from "@/components/ui/Button";
import {
  fromMultipleChoiceForm,
  type MultipleChoiceFormValues,
} from "@/lib/authoring/forms/multipleChoice";
import { describeIssues, type EditorIssue } from "@/lib/authoring/issueMessages";
import { multipleChoiceItemSchema, type Item, type ItemInputOf } from "@/lib/ngn/schemas";

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface MultipleChoiceEditorProps {
  initialValues: MultipleChoiceFormValues;
  /** Stores the form as it is, complete or not. Never publishes. */
  onSaveDraft: (values: MultipleChoiceFormValues) => Promise<SaveResult>;
  /** Called only with schema-valid item input. */
  onPublish: (item: ItemInputOf<"multiple_choice">) => Promise<SaveResult>;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

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
  const { register, control, getValues, setFocus } = useForm<MultipleChoiceFormValues>({
    defaultValues: initialValues,
  });
  // keyName keeps RHF's row key from overwriting each option's own `id`.
  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
    keyName: "fieldKey",
  });
  useWatch({ control }); // re-render on every change so the preview and problems stay current
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const ids = useId();

  const values = getValues();
  const input = fromMultipleChoiceForm(values);
  const parsed = multipleChoiceItemSchema.safeParse(input);
  const issues: EditorIssue[] = parsed.success ? [] : describeIssues(parsed.error.issues);
  const issueFor = (field: string) => issues.find((issue) => issue.field === field);
  // The last values the server accepted. Compared rather than reset, so text typed while a save
  // was in flight is neither overwritten nor mistaken for saved.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialValues));
  const isDirty = JSON.stringify(values) !== savedSnapshot;

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  function focusField(field: string) {
    if (field === "stem") setFocus("stem");
    else if (field === "correctOptionId") setFocus("correctOptionId");
    else if (/^options\.\d+\.label$/.test(field)) setFocus(field as `options.${number}.label`);
    else if (field === "options") setFocus("options.0.label");
  }

  async function saveDraft() {
    setStatus({ kind: "busy" });
    const current = getValues();
    const result = await onSaveDraft(current);
    if (result.ok) {
      setSavedSnapshot(JSON.stringify(current));
      setStatus({ kind: "done", message: "Draft saved." });
    } else {
      setStatus({
        kind: "error",
        message: result.error ?? "The draft could not be saved. Try again.",
      });
    }
  }

  async function publish() {
    if (!parsed.success) return;
    setStatus({ kind: "busy" });
    const current = getValues();
    const result = await onPublish(fromMultipleChoiceForm(current));
    if (result.ok) {
      setSavedSnapshot(JSON.stringify(current));
      setStatus({ kind: "done", message: "Published." });
    } else {
      setStatus({
        kind: "error",
        message: result.error ?? "The item could not be published. Try again.",
      });
    }
  }

  const describedBy = (field: string) =>
    // "issue-" keeps these ids apart from the fields' own ids (the stem field is `${ids}-stem`).
    issueFor(field) ? `${ids}-issue-${field.replace(/\./g, "-")}` : undefined;
  const busy = status.kind === "busy";

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form className="flex flex-col gap-6" onSubmit={(event) => event.preventDefault()} noValidate>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${ids}-stem`} className="text-sm font-medium text-ink-1">
            Question stem
          </label>
          <textarea
            id={`${ids}-stem`}
            rows={4}
            className={fieldClass}
            aria-invalid={issueFor("stem") ? true : undefined}
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
                    aria-invalid={issueFor(labelField) ? true : undefined}
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

        {issues.length > 0 ? (
          <section
            aria-label="Problems to fix"
            className="rounded-sm border border-line bg-surface-1 p-4"
          >
            <h2 className="mb-2 text-sm font-medium text-ink-1">
              Before this item can be published
            </h2>
            <ul className="flex flex-col gap-1">
              {issues.map((issue) => (
                <li key={issue.field}>
                  <button
                    type="button"
                    id={describedBy(issue.field)}
                    onClick={() => focusField(issue.field)}
                    className="tap-target text-left text-sm text-accent-ink underline-offset-4 hover:underline"
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="button" onClick={saveDraft} disabled={busy}>
            Save draft
          </Button>
          <Button
            type="button"
            variant="primary"
            aria-disabled={!parsed.success || busy}
            onClick={() => {
              if (parsed.success && !busy) void publish();
            }}
          >
            Publish
          </Button>
          {isDirty ? <p className="text-sm text-ink-2">Unsaved changes</p> : null}
          {status.kind === "done" ? (
            <p role="status" className="text-sm text-ink-2">
              {status.message}
            </p>
          ) : null}
          {status.kind === "error" ? (
            <p role="alert" className="text-sm text-incorrect">
              {status.message}
            </p>
          ) : null}
        </div>
      </form>

      <section aria-label="Preview" className="lg:sticky lg:top-4 lg:self-start">
        <p className="eyebrow mb-2">Preview</p>
        {/* The transform makes this box the containing block for the player's fixed submit bar,
            so the bar sits at the bottom of the preview instead of covering the editor. */}
        <div
          className="rounded-sm border border-line bg-surface-0 p-4 pb-24"
          style={{ transform: "translateZ(0)" }}
        >
          {/* The same player students use. The item is not keyed, so it updates in place. */}
          <ItemPlayer item={input as unknown as Item} />
        </div>
      </section>
    </div>
  );
}
