"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { textLinkClasses } from "@/components/ui/TextLink";
import { emptyEhrForm, type EhrFormValues } from "@/lib/authoring/forms/ehr";
import type { EditorIssue } from "@/lib/authoring/issueMessages";
import { EhrRecordFields, recordFieldId } from "./EhrRecordFields";

export interface EditorRecordSectionProps {
  /** The question's patient record, or undefined while it has none. */
  record: EhrFormValues | undefined;
  /** Sets or clears the record. */
  onRecordChange: (record: EhrFormValues | undefined) => void;
  /** Changes the record as it stands at the moment of the change. */
  changeRecord: (update: (current: EhrFormValues) => EhrFormValues) => void;
  /** Id prefix for the record's fields and buttons. */
  recordIds: string;
  /** The record's own problems, with the record prefix taken off their fields. */
  issues: readonly EditorIssue[];
  issueIdPrefix: string;
  issueFieldPrefix: string;
}

/**
 * A standalone question's patient record (EditorShell): Add patient record, or the record's fields
 * with Remove, which asks first. Inside a case study the case study owns the record instead.
 */
export function EditorRecordSection({
  record,
  onRecordChange,
  changeRecord,
  recordIds,
  issues,
  issueIdPrefix,
  issueFieldPrefix,
}: EditorRecordSectionProps) {
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  // Adding, keeping or removing the record changes which buttons exist, so focus is placed once
  // the new form is on the page. Event handlers set it; nothing reads it during render.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  });

  return (
    <section
      aria-labelledby={`${recordIds}-heading`}
      className="flex flex-col gap-4 border-t border-line pt-6"
    >
      <h2 id={`${recordIds}-heading`} className="text-sm font-semibold text-ink-1">
        Patient record
      </h2>
      {record ? (
        <>
          {confirmingRemove ? (
            <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-1 p-4">
              <p className="text-sm text-ink-1">Remove the patient record from this question?</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    pendingFocus.current = `${recordIds}-add`;
                    setConfirmingRemove(false);
                    onRecordChange(undefined);
                  }}
                >
                  Yes, remove it
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
                  Keep patient record
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
            issues={issues}
            idPrefix={recordIds}
            issueIdPrefix={issueIdPrefix}
            issueFieldPrefix={issueFieldPrefix}
            sectionsHeading="h3"
          />
        </>
      ) : (
        <>
          <p className="text-sm text-ink-2">
            For a Trend question or a bowtie.{" "}
            {/* A new tab, so the question being written stays open. Underlined, as a link
                  inside a line of text must be (axe link-in-text-block). */}
            <a
              href="/help/items#trend"
              target="_blank"
              rel="noopener noreferrer"
              className={textLinkClasses({ kind: "inline" })}
            >
              How Trend works<span className="sr-only"> (opens in a new tab)</span>
            </a>
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
  );
}
