"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { EditorIssue } from "@/lib/authoring/issueMessages";
import {
  EHR_LIMITS,
  EHR_TAB_KIND_LABELS,
  EHR_TAB_KINDS,
  addBlock,
  addTab,
  addTimePoint,
  moveTab,
  removeBlock,
  removeTab,
  removeTimePoint,
  updateBlock,
  updateTab,
  type EhrFormValues,
  type EhrSex,
  type EhrTabKind,
} from "@/lib/authoring/forms/ehr";
import { setTabStepAccess, setTimePointFromStep } from "@/lib/authoring/forms/ehrSteps";
import { Card } from "@/components/ui/Card";
import { textLinkClasses } from "@/components/ui/TextLink";
import { Sr, fieldClass, type FieldHelpers, type FocusLater } from "./EhrBlockEditors";
import { EhrSectionEditor, moveButtonId, type SectionPatch } from "./EhrSectionEditor";
import { FromStepSelect } from "./EhrStepControls";
import { issueMessageId } from "./issueIds";

const SEXES: { value: EhrSex; label: string }[] = [
  { value: "", label: "Choose" },
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
];

/** The element id of a record field, from its path in the record form ("patient.age"). */
export function recordFieldId(idPrefix: string, field: string): string {
  return `${idPrefix}-field-${field.replace(/\./g, "-")}`;
}

/** Focuses a record field, or the nearest control that stands for it. */
export function focusRecordField(idPrefix: string, field: string): void {
  const byPath = (path: string) => document.getElementById(recordFieldId(idPrefix, path));
  // A vitals block's own problem ("needs at least one row") has no field of its own.
  const target = byPath(field) ?? byPath(`${field}.rows.0.label`) ?? byPath("patient.age");
  // A tab's step row is folded away until opened (#336).
  const folded = target?.closest("details");
  if (folded && !folded.open) folded.open = true;
  target?.focus();
}

/**
 * How a tab's step controls are named ("Lab Results, Step 3"): its title, with its number when
 * another tab has the same title, or "Tab 3" until it has one, so no two controls share a name.
 */
function stepRowName(tabs: readonly { title: string }[], index: number): string {
  const title = tabs[index]!.title.trim();
  if (!title) return `Tab ${index + 1}`;
  const shared = tabs.filter((tab) => tab.title.trim() === title).length > 1;
  return shared ? `${title} (tab ${index + 1})` : title;
}

export interface EhrRecordFieldsProps {
  values: EhrFormValues;
  /** Applies a change to the latest record. */
  onChange: (update: (current: EhrFormValues) => EhrFormValues) => void;
  /** Problems with this record, their fields relative to it ("patient.sex"). */
  issues: readonly EditorIssue[];
  /** Prefix for this record's element ids. */
  idPrefix: string;
  /** The id prefix the problem messages are rendered with. */
  issueIdPrefix: string;
  /** The prefix the problem list gives this record's fields: "ehr." on an item, "" on its own. */
  issueFieldPrefix?: string;
  /** "h3" when the record sits under its own heading, as it does inside an item editor. */
  sectionsHeading?: "h2" | "h3";
  /**
   * A case study's record (#336): when each time point, tab and block shows. Never on an item's
   * record, which cannot have steps.
   */
  steps?: boolean;
}

/**
 * A record's fields: the fictional-record note, patient header, time points and sections. Shared
 * by the case study's record page and the record on a standalone item, which each own saving,
 * the problems list and the preview.
 */
export function EhrRecordFields({
  values,
  onChange: change,
  issues,
  idPrefix,
  issueIdPrefix,
  issueFieldPrefix = "",
  sectionsHeading: SectionsHeading = "h2",
  steps = false,
}: EhrRecordFieldsProps) {
  const [newKind, setNewKind] = useState<EhrTabKind>("history_physical");

  // Element ids to focus after the next render, first found wins. Moving and removing change which
  // buttons exist, so focus is placed once the new form is on the page.
  const pendingFocus = useRef<string[] | null>(null);
  useEffect(() => {
    const candidates = pendingFocus.current;
    if (!candidates) return;
    pendingFocus.current = null;
    for (const id of candidates) {
      const element = document.getElementById(id);
      if (element) {
        element.focus();
        return;
      }
    }
  });

  const hasIssue = (field: string) => issues.some((issue) => issue.field === field);
  const fields: FieldHelpers = {
    idFor: (field) => recordFieldId(idPrefix, field),
    invalid: (field) => (hasIssue(field) ? true : undefined),
    describedBy: (field) =>
      hasIssue(field) ? issueMessageId(issueIdPrefix, `${issueFieldPrefix}${field}`) : undefined,
  };
  // Kept apart from `fields`, which render calls: only event handlers call this.
  const focusLater: FocusLater = (...elementIds) => {
    pendingFocus.current = elementIds;
  };
  const addTimePointId = `${idPrefix}-add-time-point`;

  function changeSection(index: number, patch: SectionPatch) {
    change((current) => {
      const tab = current.tabs[index];
      if (!tab || patch.kind === undefined) return updateTab(current, index, patch);
      // A title still named for the old kind follows the new one; one the author wrote stays.
      const followsKind = tab.title === "" || tab.title === EHR_TAB_KIND_LABELS[tab.kind];
      const title =
        followsKind && patch.kind !== "custom" ? EHR_TAB_KIND_LABELS[patch.kind] : tab.title;
      return updateTab(current, index, { ...patch, title });
    });
  }

  function move(index: number, delta: -1 | 1) {
    // Focus follows the section: the same move button, or at either end the other one.
    const target = index + delta;
    const [same, other] = delta === -1 ? (["up", "down"] as const) : (["down", "up"] as const);
    focusLater(moveButtonId(idPrefix, target, same), moveButtonId(idPrefix, target, other));
    change((current) => moveTab(current, index, delta));
  }

  const patientField = (
    key: "name" | "age" | "setting" | "admissionDate",
    label: string,
    extra: { inputMode?: "numeric"; placeholder?: string } = {},
  ) => {
    const field = `patient.${key}`;
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={fields.idFor(field)} className="text-sm text-ink-1">
          {label}
        </label>
        <input
          id={fields.idFor(field)}
          type="text"
          className={`tap-target ${fieldClass}`}
          value={values.patient[key]}
          aria-invalid={fields.invalid(field)}
          aria-describedby={fields.describedBy(field)}
          onChange={(event) => {
            const text = event.target.value;
            change((current) => ({ ...current, patient: { ...current.patient, [key]: text } }));
          }}
          {...extra}
        />
      </div>
    );
  };

  return (
    <>
      <Card tone="inset" padding="sm">
        <p className="text-sm text-ink-1">
          Fictional patients only. Never enter real names, dates or details.
        </p>
      </Card>
      {steps ? (
        <p>
          {/* A new tab, so the patient record being written stays open. */}
          <a
            href="/help/items#case-study"
            target="_blank"
            rel="noopener noreferrer"
            className={textLinkClasses({ size: "sm" })}
          >
            How a case study unfolds<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-ink-1">Patient</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {patientField("name", "Name (optional)")}
          {patientField("age", "Age in years", { inputMode: "numeric" })}
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={fields.idFor("patient.sex")} className="text-sm text-ink-1">
              Sex
            </label>
            <select
              id={fields.idFor("patient.sex")}
              className={`tap-target ${fieldClass}`}
              value={values.patient.sex}
              aria-invalid={fields.invalid("patient.sex")}
              aria-describedby={fields.describedBy("patient.sex")}
              onChange={(event) => {
                const sex = event.target.value as EhrSex;
                change((current) => ({ ...current, patient: { ...current.patient, sex } }));
              }}
            >
              {SEXES.map((sex) => (
                <option key={sex.value} value={sex.value}>
                  {sex.label}
                </option>
              ))}
            </select>
          </div>
          {patientField("setting", "Care setting", { placeholder: "Medical unit" })}
          {patientField("admissionDate", "Admitted (optional)", { placeholder: "Day 2" })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-ink-1">Time points</legend>
        {values.timePoints.map((point, index) => {
          const field = `timePoints.${index}.label`;
          return (
            <div key={point.id} className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor={fields.idFor(field)} className="text-sm text-ink-1">
                  <Sr>{`Time point ${index + 1}, `}</Sr>
                  Label
                </label>
                <input
                  id={fields.idFor(field)}
                  type="text"
                  className={`tap-target ${fieldClass}`}
                  value={point.label}
                  aria-invalid={fields.invalid(field)}
                  aria-describedby={fields.describedBy(field)}
                  onChange={(event) => {
                    const label = event.target.value;
                    change((current) => ({
                      ...current,
                      timePoints: current.timePoints.map((existing, at) =>
                        at === index ? { ...existing, label } : existing,
                      ),
                    }));
                  }}
                />
              </div>
              {steps ? (
                <div className="w-36">
                  <FromStepSelect
                    field={`timePoints.${index}.fromStep`}
                    where={`Time point ${index + 1}, `}
                    fromStep={point.fromStep}
                    fields={fields}
                    onChange={(step) =>
                      change((current) => setTimePointFromStep(current, index, step))
                    }
                  />
                </div>
              ) : null}
              {values.timePoints.length > 1 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    focusLater(addTimePointId);
                    change((current) => removeTimePoint(current, point.id));
                  }}
                >
                  Remove
                  <Sr>{` time point ${index + 1}`}</Sr>
                </Button>
              ) : null}
            </div>
          );
        })}
        {values.timePoints.length < EHR_LIMITS.timePoints ? (
          <div>
            <Button id={addTimePointId} size="sm" onClick={() => change(addTimePoint)}>
              Add time point
            </Button>
          </div>
        ) : null}
      </fieldset>

      <section aria-labelledby={`${idPrefix}-sections`} className="flex flex-col gap-4">
        <SectionsHeading id={`${idPrefix}-sections`} className="text-sm font-medium text-ink-1">
          Tabs
        </SectionsHeading>
        {values.tabs.length === 0 ? <p className="text-sm text-ink-2">No tabs yet.</p> : null}
        {values.tabs.map((tab, index) => (
          <EhrSectionEditor
            key={tab.id}
            tab={tab}
            index={index}
            total={values.tabs.length}
            timePoints={values.timePoints}
            ids={idPrefix}
            fields={fields}
            focusLater={focusLater}
            onChange={(patch) => changeSection(index, patch)}
            onMove={(delta) => move(index, delta)}
            onRemove={() => {
              focusLater(fields.idFor("tabs"));
              change((current) => removeTab(current, index));
            }}
            onAddBlock={(kind) => change((current) => addBlock(current, index, kind))}
            onRemoveBlock={(blockIndex) =>
              change((current) => removeBlock(current, index, blockIndex))
            }
            onBlockChange={(blockIndex, block) =>
              change((current) => updateBlock(current, index, blockIndex, block))
            }
            stepRowName={stepRowName(values.tabs, index)}
            onStepAccess={
              steps
                ? (step, access) =>
                    change((current) => setTabStepAccess(current, index, step, access))
                : undefined
            }
          />
        ))}
        {values.tabs.length < EHR_LIMITS.tabs ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={fields.idFor("tabs")} className="text-sm text-ink-1">
                Tab kind
              </label>
              <select
                id={fields.idFor("tabs")}
                className={`tap-target ${fieldClass}`}
                value={newKind}
                aria-invalid={fields.invalid("tabs")}
                aria-describedby={fields.describedBy("tabs")}
                onChange={(event) => setNewKind(event.target.value as EhrTabKind)}
              >
                {EHR_TAB_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {EHR_TAB_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={() => change((current) => addTab(current, newKind))}>Add tab</Button>
          </div>
        ) : null}
      </section>
    </>
  );
}
