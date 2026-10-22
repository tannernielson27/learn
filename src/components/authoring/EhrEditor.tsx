"use client";

import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldClasses } from "@/components/ui/fieldClasses";
import { Notice } from "@/components/ui/Notice";
import { textLinkClasses } from "@/components/ui/TextLink";
import { describeEhrIssues, describeEmptySteps } from "@/lib/authoring/ehrIssues";
import { fromEhrForm, previewRecord, type EhrFormValues } from "@/lib/authoring/forms/ehr";
import { CASE_STUDY_STEPS } from "@/lib/authoring/forms/ehrSteps";
import { recordAtStep } from "@/lib/ngn/chartReveal";
import { ehrRecordSchema } from "@/lib/ngn/schemas";
import type { CjmmStep } from "@/lib/ngn/types";
import type { SaveResult } from "./EditorShell";
import { EhrPreview } from "./EhrPreview";
import { EhrRecordFields, focusRecordField } from "./EhrRecordFields";
import { issueMessageId } from "./issueIds";
import { useItemEditorHost, useReportDirty } from "./ItemEditorHost";

export interface EhrEditorProps {
  initialValues: EhrFormValues;
  onSave: (values: EhrFormValues) => Promise<SaveResult>;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

const SAVE_FAILED = "The patient record could not be saved. Try again.";

/**
 * A case study's patient record on its own page: the record's fields, what it still needs, Save,
 * and the record as the player shows it. Plain text and grids only, by the owner's decision for
 * Sprint 5. Save stores an unfinished record as a draft.
 */
export function EhrEditor({ initialValues, onSave }: EhrEditorProps) {
  const ids = useId();
  const [values, setValues] = useState(initialValues);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Compared rather than reset, so text typed while a save is in flight stays unsaved.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialValues));
  const isDirty = JSON.stringify(values) !== savedSnapshot;
  useReportDirty(isDirty);
  // In the case study builder the record sits under its step's heading.
  const { inCaseStudy } = useItemEditorHost();
  const busy = status.kind === "busy";

  // "" is the full patient record; a step is what a student at that step sees (#336).
  const [previewStep, setPreviewStep] = useState("");

  const parsed = ehrRecordSchema.safeParse(fromEhrForm(values));
  const issues = parsed.success
    ? describeEmptySteps(parsed.data)
    : describeEhrIssues(parsed.error.issues);
  const preview = previewRecord(values);
  const shown =
    preview && previewStep ? recordAtStep(preview, Number(previewStep) as CjmmStep) : preview;

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  async function save() {
    setStatus({ kind: "busy" });
    const current = values;
    let result: SaveResult;
    try {
      result = await onSave(current);
    } catch {
      setStatus({ kind: "error", message: SAVE_FAILED });
      return;
    }
    if (result.ok) {
      setSavedSnapshot(JSON.stringify(current));
      setStatus({ kind: "done", message: "Patient record saved." });
    } else {
      setStatus({ kind: "error", message: result.error ?? SAVE_FAILED });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        className="flex min-w-0 flex-col gap-6"
        onSubmit={(event) => event.preventDefault()}
        noValidate
      >
        <EhrRecordFields
          values={values}
          onChange={(update) => setValues(update)}
          issues={issues}
          idPrefix={ids}
          issueIdPrefix={ids}
          sectionsHeading={inCaseStudy ? "h3" : "h2"}
          steps
        />

        {issues.length > 0 ? (
          <section aria-label="Problems to fix">
            <Card padding="sm">
              <h2 className="mb-2 text-sm font-medium text-ink-1">Problems to fix</h2>
              <ul className="flex flex-col gap-1">
                {issues.map((issue) => (
                  <li key={issue.field}>
                    <button
                      type="button"
                      id={issueMessageId(ids, issue.field)}
                      onClick={() => focusRecordField(ids, issue.field)}
                      className={`${textLinkClasses({ size: "sm" })} text-left`}
                    >
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button variant="primary" disabled={busy} onClick={() => void save()}>
            Save patient record
          </Button>
          {isDirty ? <p className="text-sm text-ink-2">Unsaved changes</p> : null}
          {status.kind === "done" ? (
            <p role="status" className="text-sm text-ink-2">
              {status.message}
            </p>
          ) : null}
          {status.kind === "error" ? (
            <Notice role="alert" className="w-full">
              {status.message}
            </Notice>
          ) : null}
        </div>
      </form>

      <section aria-label="Preview" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <p className="eyebrow">Preview</p>
          <div className="flex items-center gap-2">
            <label htmlFor={`${ids}-preview-step`} className="text-sm text-ink-1">
              Preview at
            </label>
            {/* Sized to its words rather than the column: `w-auto!` over the field's own w-full,
                which Tailwind would otherwise order last. */}
            <select
              id={`${ids}-preview-step`}
              className={fieldClasses("w-auto! px-3 py-2 text-base")}
              value={previewStep}
              onChange={(event) => setPreviewStep(event.target.value)}
            >
              <option value="">Full patient record</option>
              {CASE_STUDY_STEPS.map((step) => (
                <option key={step} value={String(step)}>
                  Step {step}
                </option>
              ))}
            </select>
          </div>
        </div>
        <Card padding="sm">
          <EhrPreview record={shown} />
        </Card>
      </section>
    </div>
  );
}
