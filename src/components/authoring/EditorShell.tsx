// The parts every editor shares, pulled out of MultipleChoiceEditor so each new type only
// supplies its fields: the live preview, Problems to fix, Save draft and Publish, unsaved-change
// tracking against the last saved snapshot, and a standalone item's patient record.
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { Button } from "@/components/ui/Button";
import { emptyEhrForm, previewRecord, type EhrFormValues } from "@/lib/authoring/forms/ehr";
import type { EditorIssue } from "@/lib/authoring/issueMessages";
import { scoringSummary } from "@/lib/authoring/scoringSummary";
import type { Item } from "@/lib/ngn/schemas";
import type { ScoringModel } from "@/lib/ngn/types";
import { EhrPreview } from "./EhrPreview";
import { EhrRecordFields, focusRecordField, recordFieldId } from "./EhrRecordFields";
import { issueMessageId } from "./issueIds";
import { useItemEditorHost, useReportDirty } from "./ItemEditorHost";

export { issueMessageId };

export interface SaveResult {
  ok: boolean;
  error?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

/** Every editor's item input carries the scoring its form derives. */
export interface ScoredInput {
  scoring?: { model: ScoringModel; maxPoints: number };
}

/** Every item form may hold a patient record, in the record editor's shape. */
interface WithRecord {
  ehr?: EhrFormValues;
}

const RECORD_PREFIX = "ehr.";

export interface EditorShellProps<Values, Input extends ScoredInput> {
  /** The form as it stands right now (re-read on every render by the caller). */
  values: Values;
  initialValues: Values;
  /** Item input built from the values; previewed as-is and published only when valid. */
  input: Input;
  valid: boolean;
  issues: readonly EditorIssue[];
  /** Id prefix for problem messages, so fields can point at them with aria-describedby. */
  issueIdPrefix: string;
  focusField: (field: string) => void;
  /** Reads the latest values at the moment Save or Publish is pressed. */
  readValues: () => Values;
  toInput: (values: Values) => Input;
  onSaveDraft: (values: Values) => Promise<SaveResult>;
  onPublish: (input: Input) => Promise<SaveResult>;
  /** Sets or clears the item's patient record. Without it, the editor offers no record. */
  onRecordChange?: (record: EhrFormValues | undefined) => void;
  /** The type's own fields. */
  children: ReactNode;
}

export function EditorShell<Values, Input extends ScoredInput>({
  values,
  initialValues,
  input,
  valid,
  issues,
  issueIdPrefix,
  focusField,
  readValues,
  toInput,
  onSaveDraft,
  onPublish,
  onRecordChange,
  children,
}: EditorShellProps<Values, Input>) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Compared rather than reset, so text typed while a save is in flight is kept and stays unsaved.
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(initialValues));
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const isDirty = JSON.stringify(values) !== savedSnapshot;
  const busy = status.kind === "busy";
  // Only a valid item has a final maximum; scoringSummary says so instead of guessing.
  const scoring = scoringSummary(input.scoring, valid);

  const host = useItemEditorHost();
  useReportDirty(isDirty);
  const record = (values as WithRecord).ehr;
  // Inside a case study the case study owns the record: the item offers none, and its preview
  // shows the case study's.
  const offersRecord = Boolean(onRecordChange) && !host.inCaseStudy;
  const previewedRecord = host.inCaseStudy
    ? (host.record ?? null)
    : record
      ? previewRecord(record)
      : null;
  const showsRecordPreview = host.inCaseStudy ? Boolean(host.record) : Boolean(record);
  const recordIds = `${issueIdPrefix}-record`;
  const recordIssues = issues
    .filter((issue) => issue.field.startsWith(RECORD_PREFIX))
    .map((issue) => ({ ...issue, field: issue.field.slice(RECORD_PREFIX.length) }));

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  // Adding, keeping or removing the record changes which buttons exist, so focus is placed once
  // the new form is on the page. Event handlers set it; nothing reads it during render.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  });

  function changeRecord(update: (current: EhrFormValues) => EhrFormValues) {
    const current = (readValues() as WithRecord).ehr;
    if (current && onRecordChange) onRecordChange(update(current));
  }

  function focusProblem(field: string) {
    if (field.startsWith(RECORD_PREFIX)) {
      focusRecordField(recordIds, field.slice(RECORD_PREFIX.length));
    } else {
      focusField(field);
    }
  }

  async function run(
    action: (current: Values) => Promise<SaveResult>,
    doneMessage: string,
    failMessage: string,
  ) {
    setStatus({ kind: "busy" });
    const current = readValues();
    let result: SaveResult;
    try {
      result = await action(current);
    } catch {
      // A request that fails outright (a dropped connection) rejects instead of returning a
      // result; without this the editor would stay busy with both buttons disabled.
      setStatus({ kind: "error", message: failMessage });
      return;
    }
    if (result.ok) {
      setSavedSnapshot(JSON.stringify(current));
      setStatus({ kind: "done", message: doneMessage });
    } else {
      setStatus({ kind: "error", message: result.error ?? failMessage });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form className="flex flex-col gap-6" onSubmit={(event) => event.preventDefault()} noValidate>
        {/* Not a live region: it changes with every answer marked, and would repeat itself. */}
        <section
          aria-label="Scoring"
          className="rounded-sm border border-line bg-surface-1 px-4 py-3"
        >
          <p className="text-sm font-medium text-ink-1">{scoring.headline}</p>
          {scoring.rule ? <p className="mt-1 text-sm text-ink-2">{scoring.rule}</p> : null}
        </section>

        {children}

        {offersRecord && onRecordChange ? (
          <section
            aria-labelledby={`${recordIds}-heading`}
            className="flex flex-col gap-4 border-t border-line pt-6"
          >
            <h2 id={`${recordIds}-heading`} className="text-sm font-medium text-ink-1">
              Patient record
            </h2>
            {record ? (
              <>
                {confirmingRemove ? (
                  <div className="flex flex-col gap-3 rounded-sm border border-line bg-surface-1 p-4">
                    <p className="text-sm text-ink-1">Remove the patient record from this item?</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          pendingFocus.current = `${recordIds}-add`;
                          setConfirmingRemove(false);
                          onRecordChange(undefined);
                        }}
                      >
                        Remove record
                      </Button>
                      <Button
                        id={`${recordIds}-keep`}
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          pendingFocus.current = `${recordIds}-remove`;
                          setConfirmingRemove(false);
                        }}
                      >
                        Keep record
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Button
                      id={`${recordIds}-remove`}
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        pendingFocus.current = `${recordIds}-keep`;
                        setConfirmingRemove(true);
                      }}
                    >
                      Remove patient record
                    </Button>
                  </div>
                )}
                <EhrRecordFields
                  values={record}
                  onChange={changeRecord}
                  issues={recordIssues}
                  idPrefix={recordIds}
                  issueIdPrefix={issueIdPrefix}
                  issueFieldPrefix={RECORD_PREFIX}
                  sectionsHeading="h3"
                />
              </>
            ) : (
              <>
                <p className="text-sm text-ink-2">
                  Give a Trend item or a standalone bowtie a record to read from. With two or more
                  time points, the record gets a time selector.
                </p>
                <div>
                  <Button
                    id={`${recordIds}-add`}
                    size="sm"
                    onClick={() => {
                      pendingFocus.current = recordFieldId(recordIds, "patient.age");
                      onRecordChange(emptyEhrForm());
                    }}
                  >
                    Add patient record
                  </Button>
                </div>
              </>
            )}
          </section>
        ) : null}

        {issues.length > 0 ? (
          <section
            aria-label="Problems to fix"
            className="rounded-sm border border-line bg-surface-1 p-4"
          >
            {/* Inside a case study the step's own heading is the h2 above this. */}
            {host.inCaseStudy ? (
              <h3 className="mb-2 text-sm font-medium text-ink-1">
                Before this item can be published
              </h3>
            ) : (
              <h2 className="mb-2 text-sm font-medium text-ink-1">
                Before this item can be published
              </h2>
            )}
            <ul className="flex flex-col gap-1">
              {issues.map((issue) => (
                <li key={issue.field}>
                  <button
                    type="button"
                    id={issueMessageId(issueIdPrefix, issue.field)}
                    onClick={() => focusProblem(issue.field)}
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
          <Button
            type="button"
            disabled={busy}
            onClick={() =>
              run(onSaveDraft, "Draft saved.", "The draft could not be saved. Try again.")
            }
          >
            Save draft
          </Button>
          <Button
            type="button"
            variant="primary"
            aria-disabled={!valid || busy}
            onClick={() => {
              if (!valid || busy) return;
              void run(
                (current) => onPublish(toInput(current)),
                "Published.",
                "The item could not be published. Try again.",
              );
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

      <section aria-label="Preview" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
        <p className="eyebrow mb-2">Preview</p>
        {/* The transform makes this box the containing block for the player's fixed submit bar. */}
        <div
          className="rounded-sm border border-line bg-surface-0 p-4 pb-24"
          style={{ transform: "translateZ(0)" }}
        >
          {/* A record reads first, as it does above the question on a phone. */}
          {showsRecordPreview ? (
            <div className="mb-6 border-b border-line pb-6">
              <EhrPreview record={previewedRecord} />
            </div>
          ) : null}
          {/* The same player students use, unkeyed so it updates in place. */}
          <ItemPlayer item={input as unknown as Item} />
        </div>
      </section>
    </div>
  );
}
