"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  REVIEW_FILTERS,
  filterCounts,
  groupByFile,
  importSummary,
  matchesFilter,
  type ReviewEntryView,
  type ReviewFilter,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import type { AiImportFailure } from "@/lib/authoring/aiImportUpload";
import type { ItemType } from "@/lib/ngn/schemas";
import { AiImportReviewEntry, type EntryChange } from "./AiImportReviewEntry";
import { postJson } from "./aiImportRequests";

/** What a drop or a restore is told: the entry, and the version the page showed. */
export interface EntryRef {
  batchId: string;
  entryId: string;
  version: number;
}

/** The Server Functions the page hands in (`src/app/author/aiImportActions.ts`). */
export interface AiImportReviewActions {
  drop: (input: EntryRef) => EntryChange;
  restore: (input: EntryRef) => EntryChange;
}

export interface AiImportReviewProps {
  bankId: string;
  quizName: string;
  batchId: string;
  fileNames: string[];
  entries: ReviewEntryView[];
  actions: AiImportReviewActions;
  /** The import itself is #348; until it is handed in, the button explains it is not available. */
  onImport?: () => void;
}

type Override = { version: number; status: ReviewStatus };

/**
 * Review an AI import batch (#346): every staged question under its file in source order,
 * filtered by status, each drawn by the real players with its key, its reasons and its source.
 * The teacher drops or restores a question, or has one read again as another type. Each change
 * names the version it was shown, so two tabs cannot overwrite each other.
 */
export function AiImportReview({
  bankId,
  quizName,
  batchId,
  fileNames,
  entries: served,
  actions,
  onImport,
}: AiImportReviewProps) {
  const id = useId();
  const router = useRouter();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  // A drop or restore shows at once; a newer version from the server (a refresh) wins.
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const entries = served.map((entry) => {
    const override = overrides[entry.id];
    return override && override.version > entry.version ? { ...entry, ...override } : entry;
  });

  const counts = filterCounts(entries);
  const summary = importSummary(entries);
  const shown = entries.filter((entry) => matchesFilter(entry, filter));
  const groups = groupByFile(shown, fileNames);
  // Numbered across the whole import in source order, so every heading is its own.
  const numbers = new Map(
    groupByFile(entries, fileNames)
      .flatMap((group) => group.entries)
      .map((entry, index) => [entry.id, index + 1] as const),
  );
  const headingOf = (entry: ReviewEntryView) =>
    entry.kind === "case_study"
      ? `Case study: ${entry.group?.title ?? "Untitled"}`
      : `Question ${numbers.get(entry.id) ?? ""}`.trim();

  const change =
    (act: (input: EntryRef) => EntryChange) =>
    async (entry: ReviewEntryView): EntryChange => {
      const result = await act({ batchId, entryId: entry.id, version: entry.version });
      if (result.ok) {
        setOverrides((now) => ({
          ...now,
          [entry.id]: { version: result.version, status: result.status },
        }));
      }
      return result;
    };

  const retype = async (
    entry: ReviewEntryView,
    type: ItemType,
  ): Promise<{ ok: true } | AiImportFailure> => {
    const result = await postJson<{ ok: true; version: number; status: ReviewStatus }>(
      "/api/ai-import/retype",
      { batchId, entryId: entry.id, version: entry.version, type },
    );
    if (result.ok) router.refresh();
    return result.ok ? { ok: true } : result;
  };

  const blocked = summary.blockers.length > 0;
  return (
    <div className="flex flex-col gap-8">
      <section
        aria-labelledby={`${id}-import`}
        className="flex flex-col gap-3 rounded-sm border border-line bg-surface-1 p-4 sm:max-w-2xl"
      >
        <h2 id={`${id}-import`} className="font-read text-2xl text-ink-1">
          Review the questions
        </h2>
        <p className="text-sm text-ink-2">
          Nothing has been added to {quizName} yet. Drop what you do not want; questions that are
          not importable are left out.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={blocked || !onImport}
            aria-describedby={`${id}-why`}
            onClick={onImport}
            data-testid="import-button"
          >
            {summary.label}
          </Button>
          <Link
            href={`/author/banks/${bankId}`}
            className="tap-target inline-flex items-center text-accent-ink underline"
          >
            Back to {quizName}
          </Link>
        </div>
        <div id={`${id}-why`} className="text-sm text-ink-1">
          {blocked ? (
            <ul className="flex list-disc flex-col gap-1 pl-5">
              {summary.blockers.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : onImport ? null : (
            <p className="text-ink-2">
              Importing is not available yet. Your review is kept until then.
            </p>
          )}
        </div>
      </section>

      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
        {REVIEW_FILTERS.map((option) => {
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(option.value)}
              className={`tap-target rounded-sm border px-3 text-sm transition-colors duration-fast motion-reduce:transition-none ${
                active
                  ? "border-accent bg-accent-soft text-ink-1"
                  : "border-line bg-surface-1 text-ink-1 hover:bg-surface-2"
              }`}
            >
              {option.label} <span className="text-ink-2">({counts[option.value]})</span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <p className="text-ink-2">No questions match this filter.</p>
      ) : (
        groups.map((group) => (
          <section key={group.name} aria-label={group.name} className="flex flex-col gap-6">
            <h2 className="text-sm font-medium break-words text-ink-2">{group.name}</h2>
            {group.entries.map((entry) => (
              <AiImportReviewEntry
                key={entry.id}
                entry={entry}
                heading={headingOf(entry)}
                onDrop={change(actions.drop)}
                onRestore={change(actions.restore)}
                onRetype={retype}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
