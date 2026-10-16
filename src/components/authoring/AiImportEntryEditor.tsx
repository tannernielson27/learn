"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  STATUS_LABELS,
  type ReviewReason,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import type { AiImportFailure } from "@/lib/authoring/aiImportUpload";
import { ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import type { SaveResult } from "./EditorShell";
import { ItemEditorHostContext, type ItemEditorHost } from "./ItemEditorHost";
import { ItemEditorSwitch, type ItemEditorLoaderProps } from "./ItemEditorSwitch";
import { GuardedLink, useLeaveGuard, type LeaveGuard } from "./LeaveGuard";

/** What a save is told: the entry, the version the page last had, and the form as it stands. */
export interface EntryFixInput {
  batchId: string;
  entryId: string;
  version: number;
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
  reviewHref: string;
  editor: ItemEditorLoaderProps;
  /** The Server Function the page hands in (`src/app/author/aiImportFixActions.ts`). */
  save: (input: EntryFixInput) => Promise<EntryFixResult>;
}

const SAVED: Partial<Record<ReviewStatus, string>> = {
  ready: "Saved. This question is ready to import.",
  needs_answer: "Saved. It still needs an answer.",
  needs_fix: "Saved. It still needs a fix.",
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
 */
export function AiImportEntryEditor({
  batchId,
  entryId,
  version,
  heading,
  status,
  reasons,
  sourceExcerpt,
  reviewHref,
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
    () => ({ inCaseStudy: false, saveOnly: true, onDirtyChange: setDirty }),
    [],
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
    const result = await save({ batchId, entryId, version: latest, values });
    if (!result.ok) return { ok: false, error: result.message };
    setSaved(result.version);
    // The status and what is left to check come from the server, worked out again.
    router.refresh();
    return { ok: true, message: SAVED[result.status] ?? "Saved." };
  }

  return (
    <>
      <p className="mb-2 text-sm">
        <GuardedLink
          href={reviewHref}
          className="text-accent-ink underline-offset-4 hover:underline"
        >
          Back to the review
        </GuardedLink>
      </p>
      <p className="eyebrow mb-1">{ITEM_TYPE_LABELS[editor.type]}</p>
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="font-read text-3xl break-words text-ink-1">Edit {heading}</h1>
        <p className="text-sm font-medium text-ink-1" data-testid="entry-status">
          {STATUS_LABELS[status]}
        </p>
      </div>
      <div className="mb-6 flex max-w-prose flex-col gap-3">
        <p className="text-sm text-ink-2">
          Nothing reaches the quiz until the import. Save brings your changes back to the review.
        </p>
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
        <details className="rounded-sm border border-line bg-surface-1">
          <summary className="tap-target cursor-pointer px-3 py-2 text-sm font-medium text-ink-1">
            Show the document&apos;s words
          </summary>
          <p className="border-t border-line p-3 font-read text-base break-words whitespace-pre-wrap text-ink-1">
            {sourceExcerpt || "The document's text for this question was not kept."}
          </p>
        </details>
      </div>
      {leaving ? (
        <div
          ref={ask}
          role="alertdialog"
          aria-labelledby={askId}
          tabIndex={-1}
          className="mb-4 flex flex-col gap-3 rounded-sm border border-line bg-surface-1 p-4"
        >
          <p id={askId} className="text-sm font-medium text-ink-1">
            This question has unsaved changes
          </p>
          <p className="text-sm text-ink-2">Stay to save them, or discard them and leave.</p>
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
