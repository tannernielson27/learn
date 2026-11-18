"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  STATUS_LABELS,
  type ReviewReason,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import type { AiImportFailure } from "@/lib/authoring/aiImportUpload";
import { ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import type { EhrRecord } from "@/lib/ngn/schemas";
import { AiImportSource } from "./AiImportSource";
import type { SaveResult } from "./EditorShell";
import { ItemEditorHostContext, type ItemEditorHost } from "./ItemEditorHost";
import { ItemEditorSwitch, type ItemEditorLoaderProps } from "./ItemEditorSwitch";
import { GuardedLink, useLeaveGuard, type LeaveGuard } from "./LeaveGuard";
import { BackLinkMark, backLinkClasses } from "@/components/ui/BackLink";

/** What a save is told: the entry, the version the page last had, and the form as it stands. */
export interface EntryFixInput {
  batchId: string;
  entryId: string;
  version: number;
  /** A case study's step, from 1 (#593); absent for a single question. */
  step?: number;
  values: unknown;
}

export type EntryFixResult = { ok: true; version: number; status: ReviewStatus } | AiImportFailure;

export interface AiImportEntryEditorProps {
  batchId: string;
  entryId: string;
  /** The version the page read; each save names the latest one it knows. */
  version: number;
  /** "Question 3", as the review screen numbers it. */
  heading: string;
  status: ReviewStatus;
  reasons: ReviewReason[];
  sourceExcerpt: string;
  /** For a PDF: the pages the question was read from, and the file's name. */
  sourcePages?: { from: number; to: number } | null;
  fileName?: string | null;
  /** The review screen, at this question's card and under the filter the teacher came from. */
  reviewHref: string;
  /** #593: the next question or step that needs attention; null when this is the last. */
  nextHref?: string | null;
  /** #593: set when the question is one step of a case study, with its patient record if whole. */
  caseStep?: { step: number; record: EhrRecord | null };
  editor: ItemEditorLoaderProps;
  /** The Server Function the page hands in (`src/app/author/aiImportFixActions.ts`). */
  save: (input: EntryFixInput) => Promise<EntryFixResult>;
}

const SAVED: Partial<Record<ReviewStatus, string>> = {
  ready: "Saved. This question is ready to import.",
  needs_answer: "Saved. It still needs an answer.",
  needs_fix: "Saved. It still needs a fix.",
};

/** After a step is saved, the status is the whole case study's. */
const SAVED_STEP: Partial<Record<ReviewStatus, string>> = {
  ready: "Saved. The case study is ready to import.",
  needs_answer: "Saved. Another step still needs its key.",
  needs_fix: "Saved. The case study still needs a fix.",
};

/** Staged questions are imported as drafts (#348); nothing is published from here. */
const notPublished = async (): Promise<SaveResult> => ({
  ok: false,
  error: "A question is published from its quiz once it is imported.",
});

/**
 * Fix a staged AI import question with its type's own editor (#347): the same form, problems and
 * preview as the question page, with one Save that writes back to the staged entry. A save names
 * the version it last saw, so another tab's change is refused rather than overwritten.
 *
 * Since #593 a second button saves and goes straight to the next question that needs attention,
 * the way back keeps the review's filter and place, and a case study's step opens here too, with
 * the case study's patient record beside it.
 */
export function AiImportEntryEditor({
  batchId,
  entryId,
  version,
  heading,
  status,
  reasons,
  sourceExcerpt,
  sourcePages = null,
  fileName = null,
  reviewHref,
  nextHref = null,
  caseStep,
  editor,
  save,
}: AiImportEntryEditorProps) {
  const router = useRouter();
  const askId = useId();
  const [saved, setSaved] = useState(version);
  // A refreshed page may know a newer version than this tab's last save, never an older one.
  const latest = Math.max(saved, version);
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const host = useMemo<ItemEditorHost>(
    () => ({
      // A step has no record of its own: the case study's is shown beside it.
      inCaseStudy: caseStep !== undefined,
      record: caseStep?.record,
      saveOnly: true,
      onDirtyChange: setDirty,
      saveAndGo: {
        label: nextHref ? "Save and go to the next one" : "Save and go back to the review",
        go: () => router.push(nextHref ?? reviewHref),
      },
    }),
    [caseStep, nextHref, reviewHref, router],
  );

  const guardLeave = useCallback<LeaveGuard>(
    (href) => {
      if (!dirty) return false;
      setLeaving(href);
      return true;
    },
    [dirty],
  );
  useLeaveGuard(guardLeave);
  const ask = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (leaving) ask.current?.focus();
  }, [leaving]);

  async function saveFix(values: unknown): Promise<SaveResult> {
    const result = await save({
      batchId,
      entryId,
      version: latest,
      ...(caseStep ? { step: caseStep.step } : {}),
      values,
    });
    if (!result.ok) return { ok: false, error: result.message };
    setSaved(result.version);
    // The status and what is left to check come from the server, worked out again.
    router.refresh();
    return { ok: true, message: (caseStep ? SAVED_STEP : SAVED)[result.status] ?? "Saved." };
  }

  return (
    <>
      <p className="mb-2">
        <GuardedLink href={reviewHref} className={backLinkClasses()}>
          <BackLinkMark />
          <span>Back to the review</span>
        </GuardedLink>
      </p>
      <PageHeader
        className="mb-4"
        label={
          <>
            <span>{ITEM_TYPE_LABELS[editor.type]}</span>
            <Badge data-testid="entry-status">{STATUS_LABELS[status]}</Badge>
          </>
        }
        title={`Edit ${heading}`}
      />
      <div className="mb-6 flex max-w-prose flex-col gap-3">
        {reasons.length > 0 ? (
          <ul
            aria-label="What to check"
            className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-1"
          >
            {reasons.map((reason, index) => (
              <li key={`${reason.code}-${index}`}>{reason.message}</li>
            ))}
          </ul>
        ) : null}
        <details className="rounded-md border border-line bg-surface-1">
          <summary className="tap-target cursor-pointer px-3 py-2 text-sm font-medium text-ink-1">
            Show the document&apos;s words
          </summary>
          <div className="border-t border-line p-3">
            <AiImportSource text={sourceExcerpt} pages={sourcePages} fileName={fileName} />
          </div>
        </details>
      </div>
      {leaving ? (
        <div
          ref={ask}
          role="alertdialog"
          aria-labelledby={askId}
          tabIndex={-1}
          className="mb-4 flex flex-col gap-3 rounded-md border border-line bg-surface-1 p-4"
        >
          <p id={askId} className="text-sm font-medium text-ink-1">
            This question has unsaved changes
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                const href = leaving;
                setLeaving(null);
                router.push(href);
              }}
            >
              Discard changes
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLeaving(null)}>
              Stay on this question
            </Button>
          </div>
        </div>
      ) : null}
      <ItemEditorHostContext.Provider value={host}>
        <ItemEditorSwitch editor={editor} onSaveDraft={saveFix} onPublish={notPublished} />
      </ItemEditorHostContext.Provider>
    </>
  );
}
