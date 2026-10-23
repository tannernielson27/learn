// The parts every editor shares, pulled out of MultipleChoiceEditor so each new type only
// supplies its fields: the live preview, Problems to fix, Save draft and Publish, unsaved-change
// tracking against the last saved snapshot, and a standalone item's patient record.
"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { ItemPlayer } from "@/components/question/ItemPlayer";
import { Card } from "@/components/ui/Card";
import { previewRecord, type EhrFormValues } from "@/lib/authoring/forms/ehr";
import type { EditorIssue } from "@/lib/authoring/issueMessages";
import { scoringSummary } from "@/lib/authoring/scoringSummary";
import { editorWarnings, RATIONALE_FIELD, rationaleProblem } from "@/lib/authoring/warningMessages";
import { itemSchema, type Item } from "@/lib/ngn/schemas";
import { scoreInProcess } from "@/lib/ngn/submit";
import type { CjmmStep, ScoringModel } from "@/lib/ngn/types";
import { EhrPreview } from "./EhrPreview";
import { EditorActions } from "./EditorActions";
import { EditorChecks } from "./EditorChecks";
import { EditorRecordSection } from "./EditorRecordSection";
import { focusRecordField } from "./EhrRecordFields";
import { issueMessageId } from "./issueIds";
import { useItemEditorHost, useReportDirty } from "./ItemEditorHost";
import { TagFields } from "./TagFields";
import { fieldClasses } from "@/components/ui/fieldClasses";

export { issueMessageId };

export interface SaveResult {
  ok: boolean;
  error?: string;
  /** What to say once it is saved, when the host has more to say than the editor's own words. */
  message?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "busy" }
  // `shownWith` is the form as the message appeared; once it changes, the message is stale.
  | { kind: "done"; message: string; shownWith: string }
  | { kind: "error"; message: string };

/** Every editor's item input carries the scoring its form derives and its rationale. */
export interface ScoredInput {
  scoring?: { model: ScoringModel; maxPoints: number };
  rationale?: { general?: { value: string } };
}

/** Every item form may hold a patient record, in the record editor's shape. */
interface WithRecord {
  ehr?: EhrFormValues;
}

/** Every item form carries its tags and CJMM step. */
interface WithTags {
  tags?: string[];
  cjmmStep?: CjmmStep;
}

const RECORD_PREFIX = "ehr.";
const OPTION_RATIONALE = /^options\.(\d+)\.rationale$/;
const fieldClass = fieldClasses("px-3 py-2 text-base");

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
  /** Sets the item's tags. Without it, the editor offers no tags. */
  onTagsChange?: (tags: string[]) => void;
  /** Sets or clears the item's CJMM step; never offered inside a case study, whose place sets it. */
  onStepChange?: (step: CjmmStep | undefined) => void;
  /** The form's general rationale field, which the shell lays out and checks before publishing. */
  rationaleField: UseFormRegisterReturn<"rationaleGeneral">;
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
  onTagsChange,
  onStepChange,
  rationaleField,
  children,
}: EditorShellProps<Values, Input>) {
  const host = useItemEditorHost();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Compared rather than reset, so text typed while a save is in flight is kept and stays unsaved.
  // A restored version opens against the saved draft instead, so it starts out unsaved.
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(host.savedValues ?? initialValues),
  );
  const valuesJson = JSON.stringify(values);
  const isDirty = valuesJson !== savedSnapshot;
  const busy = status.kind === "busy";
  // Only a valid item has a final maximum; scoringSummary says so instead of guessing.
  const scoring = scoringSummary(input.scoring, valid);
  // A missing rationale blocks publishing (spec §6), so it reads as one more problem to fix.
  // Saving without publishing never needs it, so a Save-only editor does not ask for it yet.
  const missingRationale = host.saveOnly ? null : rationaleProblem(input.rationale);
  const problems = missingRationale ? [...issues, missingRationale] : issues;
  const canPublish = valid && !missingRationale;
  // Advice needs a whole item to judge, so it waits until the item is valid.
  const parsed = valid ? itemSchema.safeParse(input) : null;
  const warnings = parsed?.success ? editorWarnings(parsed.data) : [];
  const rationaleId = `${issueIdPrefix}-rationale`;
  const unpublishId = `${issueIdPrefix}-unpublish`;

  // The player keeps what its last submit revealed and draws its marks from that, not from the
  // item it is handed (#326). So once the key, rationale or scoring behind a shown score has been
  // edited, the preview starts a new round: a fresh player, back in answer mode. Nothing else
  // remounts it, and an edit made before any submit leaves the answer being tried where it is.
  const scoredFields = JSON.stringify([
    (input as { answerKey?: unknown }).answerKey,
    input.rationale,
    input.scoring,
  ]);
  const [preview, setPreview] = useState<{ round: number; scoredWith: string | null }>({
    round: 0,
    scoredWith: null,
  });
  if (preview.scoredWith !== null && preview.scoredWith !== scoredFields) {
    setPreview({ round: preview.round + 1, scoredWith: null });
  }

  useReportDirty(isDirty);
  const { onBusyChange } = host;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
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

  function changeRecord(update: (current: EhrFormValues) => EhrFormValues) {
    const current = (readValues() as WithRecord).ehr;
    if (current && onRecordChange) onRecordChange(update(current));
  }

  function focusProblem(field: string) {
    const optionRationale = OPTION_RATIONALE.exec(field);
    if (field === RATIONALE_FIELD) {
      document.getElementById(rationaleId)?.focus();
    } else if (optionRationale) {
      document.getElementById(`${issueIdPrefix}-why-${optionRationale[1]}`)?.focus();
    } else if (field.startsWith(RECORD_PREFIX)) {
      focusRecordField(recordIds, field.slice(RECORD_PREFIX.length));
    } else {
      focusField(field);
    }
  }

  async function run(
    action: (current: Values) => Promise<SaveResult>,
    doneMessage: string,
    failMessage: string,
    nowPublished: boolean,
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
      setStatus({
        kind: "done",
        message: result.message ?? doneMessage,
        shownWith: JSON.stringify(readValues()),
      });
      host.onPublishedChange?.(nowPublished);
    } else {
      setStatus({ kind: "error", message: result.error ?? failMessage });
    }
  }

  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
      <EditorActions
        saveOnly={Boolean(host.saveOnly)}
        published={Boolean(host.published)}
        busy={busy}
        canPublish={canPublish}
        dirty={isDirty}
        done={status.kind === "done" && status.shownWith === valuesJson ? status.message : null}
        error={status.kind === "error" ? status.message : null}
        unpublishId={unpublishId}
        onSave={() =>
          run(onSaveDraft, "Saved.", "The question could not be saved. Try again.", false)
        }
        onSaveDraft={() =>
          run(
            onSaveDraft,
            // Saving a draft unpublishes the item, so the message says so.
            host.published ? "Saved as a draft. Publish to use it again." : "Draft saved.",
            "The draft could not be saved. Try again.",
            false,
          )
        }
        onPublish={() => {
          if (!canPublish || busy) return;
          void run(
            (current) => onPublish(toInput(current)),
            "Published.",
            "The question could not be published. Try again.",
            true,
          );
        }}
      />
      <form
        className="flex min-w-0 flex-col gap-6"
        onSubmit={(event) => event.preventDefault()}
        noValidate
      >
        {/* Not a live region: it changes with every answer marked, and would repeat itself. */}
        <Card tone="inset" padding="sm" role="region" aria-label="Scoring">
          <p className="text-sm font-semibold text-ink-1">{scoring.headline}</p>
          {scoring.rule ? <p className="mt-1 text-sm text-ink-2">{scoring.rule}</p> : null}
        </Card>

        {children}

        <div className="flex flex-col gap-2">
          <label htmlFor={rationaleId} className="text-sm font-medium text-ink-1">
            Rationale
          </label>
          <textarea
            id={rationaleId}
            rows={3}
            className={fieldClass}
            aria-invalid={missingRationale ? true : undefined}
            aria-describedby={
              missingRationale ? issueMessageId(issueIdPrefix, RATIONALE_FIELD) : undefined
            }
            {...rationaleField}
          />
        </div>

        {onTagsChange ? (
          <TagFields
            idPrefix={issueIdPrefix}
            tags={(values as WithTags).tags ?? []}
            cjmmStep={(values as WithTags).cjmmStep}
            onTagsChange={onTagsChange}
            onStepChange={host.inCaseStudy ? undefined : onStepChange}
            headingLevel={host.inCaseStudy ? "h3" : "h2"}
          />
        ) : null}

        {offersRecord && onRecordChange ? (
          <EditorRecordSection
            record={record}
            onRecordChange={onRecordChange}
            changeRecord={changeRecord}
            recordIds={recordIds}
            issues={recordIssues}
            issueIdPrefix={issueIdPrefix}
            issueFieldPrefix={RECORD_PREFIX}
          />
        ) : null}

        <EditorChecks
          problems={problems}
          warnings={warnings}
          issueIdPrefix={issueIdPrefix}
          nested={host.inCaseStudy}
          focusProblem={focusProblem}
        />
      </form>

      {/* Below the action bar, which stays at the top from 1024px. */}
      <section
        aria-label="Preview"
        className="min-w-0 rounded-md bg-surface-2 p-4 sm:p-6 lg:sticky lg:top-24 lg:self-start"
      >
        <p className="eyebrow mb-3">Preview · what a student sees</p>
        {/* A phone's width, as students answer on one (Editor mockup). The player's submit bar
            sits at the end of the preview here, not stuck to the teacher's window over the
            options; the transform still contains it if a rule ever makes it fixed again. */}
        <div
          className="mx-auto w-full max-w-sm rounded-md border border-line bg-surface-0 p-4 shadow-elevation-1 [&_[data-submit-bar]]:static [&_[data-submit-bar]]:mt-6 [&_[data-submit-bar]]:w-auto [&_[data-submit-bar]]:px-0"
          style={{ transform: "translateZ(0)" }}
        >
          {/* A record reads first, as it does above the question on a phone. */}
          {showsRecordPreview ? (
            <div className="mb-6 border-b border-line pb-6">
              <EhrPreview record={previewedRecord} />
            </div>
          ) : null}
          {/* The same player students use. Its key holds still while the author types, so it
              updates in place; it changes only to drop a score the item no longer agrees with
              (#326). The author's own browser scores the preview (ADR 0003, amended 2026-09-13):
              they may read their own org's keys, and this route sits behind requireAuthor. */}
          <ItemPlayer
            key={preview.round}
            item={input as unknown as Item}
            submit={scoreInProcess(input as unknown as Item)}
            onSubmitted={() => setPreview((now) => ({ ...now, scoredWith: scoredFields }))}
          />
        </div>
      </section>
    </div>
  );
}
