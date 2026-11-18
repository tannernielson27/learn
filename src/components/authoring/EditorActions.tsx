"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { Popover } from "@/components/ui/Popover";
import type { EditorIssue } from "@/lib/authoring/issueMessages";
import { textLinkClasses } from "@/components/ui/TextLink";

/** How many problems the summary beside Publish lists; the rest are in the list under the fields. */
export const SUMMARY_LIMIT = 3;

/** The More menu's panel id: one editor with a menu per page, the standalone question's. */
export const EDITOR_MORE_ID = "editor-more";

export interface EditorActionsProps {
  /** A host that only saves (a case study's step before #312): one Save, no Publish. */
  saveOnly: boolean;
  published: boolean;
  busy: boolean;
  canPublish: boolean;
  dirty: boolean;
  /** What the last save said, while the form still matches it. */
  done: string | null;
  /** Why the last save or publish failed. */
  error: string | null;
  unpublishId: string;
  /** What stops publishing, the same list as Problems to fix under the fields. */
  problems?: readonly EditorIssue[];
  /** Takes the author to a problem's field. */
  focusProblem?: (field: string) => void;
  /** Prefix for this editor's ids, so a case study's steps never share one. */
  idPrefix?: string;
  /** The rarer actions (Duplicate, Archive), behind More; none on a host that offers none. */
  more?: ReactNode;
  onSave: () => void;
  /** A Save-only host's second button: save, then go on (`ItemEditorHost.saveAndGo`). */
  saveAndGo?: { label: string; run: () => void };
  onSaveDraft: () => void;
  onPublish: () => void;
}

const problemCount = (count: number) => (count === 1 ? "1 problem" : `${count} problems`);

// A button that takes the author to a field: the shared text link's look (#563), its words kept
// to the start where a long one wraps.
const SUMMARY_ITEM_CLASSES = `${textLinkClasses({ size: "sm" })} text-left`;

/**
 * Save draft, Publish and More (#563). Publish is the one primary and Save draft the secondary;
 * Duplicate and Archive wait behind More. From 1024px the bar stays at the top while the fields
 * scroll; on a phone it is the last thing in the editor and sticks to the foot of the window, as
 * the player's Submit bar does, so Publish is always in reach.
 *
 * Why Publish cannot go yet sits beside it: how many problems there are, which opens a short
 * list of them, each taking the author to its field. Pressing Publish while there are problems
 * opens that list as an alert and moves focus to it. The full list stays under the fields
 * (`EditorChecks`), with the same words.
 */
export function EditorActions({
  saveOnly,
  published,
  busy,
  canPublish,
  dirty,
  done,
  error,
  unpublishId,
  problems = [],
  focusProblem,
  idPrefix = "editor",
  more,
  onSave,
  saveAndGo,
  onSaveDraft,
  onPublish,
}: EditorActionsProps) {
  const [open, setOpen] = useState(false);
  const [focusSummary, setFocusSummary] = useState(0);
  const summary = useRef<HTMLDivElement>(null);
  const countId = `${idPrefix}-problem-count`;
  const summaryId = `${idPrefix}-problem-summary`;
  const blocked = !saveOnly && problems.length > 0;
  const showing = blocked && open;

  useEffect(() => {
    if (focusSummary > 0) summary.current?.focus();
  }, [focusSummary]);

  function publish() {
    if (blocked) {
      setOpen(true);
      setFocusSummary((count) => count + 1);
    }
    onPublish();
  }

  return (
    <div
      data-editor-actions
      className={
        "sticky bottom-0 z-10 order-last flex max-h-[60dvh] flex-col gap-3 overflow-y-auto border-t border-line bg-surface-0 pt-3 " +
        "[padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))] " +
        "lg:top-0 lg:bottom-auto lg:order-none lg:col-span-2 lg:max-h-none lg:overflow-visible lg:border-t-0 lg:border-b lg:pb-4"
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {saveOnly ? (
          <>
            <Button type="button" variant="primary" disabled={busy} onClick={onSave}>
              Save
            </Button>
            {saveAndGo ? (
              <Button type="button" variant="secondary" disabled={busy} onClick={saveAndGo.run}>
                {saveAndGo.label}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              aria-describedby={published ? unpublishId : undefined}
              onClick={onSaveDraft}
            >
              Save draft
            </Button>
            <Button
              type="button"
              variant="primary"
              aria-disabled={!canPublish || busy}
              aria-describedby={blocked ? countId : undefined}
              onClick={publish}
            >
              Publish
            </Button>
          </>
        )}
        {more ? (
          <Popover
            id={EDITOR_MORE_ID}
            width="sm"
            buttonClassName={buttonClasses({ variant: "ghost" })}
            label={
              <>
                More
                <Icon icon={ChevronDown} />
              </>
            }
          >
            <div className="flex flex-col gap-1">{more}</div>
          </Popover>
        ) : null}
        {blocked ? (
          <button
            type="button"
            id={countId}
            aria-expanded={open}
            aria-controls={open ? summaryId : undefined}
            onClick={() => setOpen((now) => !now)}
            className="tap-target inline-flex items-center gap-1 text-sm font-semibold text-ink-1 underline-offset-4 hover:underline"
          >
            {problemCount(problems.length)} to fix
            <Icon icon={ChevronDown} className={open ? "rotate-180" : undefined} />
          </button>
        ) : null}
        {dirty ? <p className="text-sm text-ink-2">Unsaved changes</p> : null}
        {done ? (
          <p role="status" className="text-sm text-ink-2">
            {done}
          </p>
        ) : null}
      </div>
      {showing ? (
        <Notice
          ref={summary}
          id={summaryId}
          tabIndex={-1}
          role="alert"
          title={
            problems.length === 1
              ? "Fix this problem to publish"
              : `Fix these ${problems.length} problems to publish`
          }
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <ul className="flex flex-col">
            {problems.slice(0, SUMMARY_LIMIT).map((issue) => (
              <li key={issue.field}>
                <button
                  type="button"
                  onClick={() => focusProblem?.(issue.field)}
                  className={SUMMARY_ITEM_CLASSES}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
          {problems.length > SUMMARY_LIMIT ? (
            <p className="text-sm">
              {problems.length - SUMMARY_LIMIT} more in Problems to fix, under the fields.
            </p>
          ) : null}
        </Notice>
      ) : null}
      {error ? <Notice role="alert">{error}</Notice> : null}
      {published ? (
        <p id={unpublishId} className="text-sm text-ink-2">
          Saving a draft unpublishes it.
        </p>
      ) : null}
    </div>
  );
}
