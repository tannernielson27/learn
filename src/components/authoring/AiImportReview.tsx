"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button, PRESS_CLASSES } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextLink } from "@/components/ui/TextLink";
import {
  REVIEW_FILTERS,
  filterCounts,
  groupByFile,
  importSummary,
  importedSentence,
  matchesFilter,
  type ReviewEntryView,
  type ReviewFilter,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import type { AiImportFailure } from "@/lib/authoring/aiImportUpload";
import type { ItemType } from "@/lib/ngn/schemas";
import { AiImportDiscard, UNEXPECTED } from "./AiImportDiscard";
import { AiImportReviewEntry, type EntryChange } from "./AiImportReviewEntry";
import { FieldError } from "./FieldError";
import { postJson } from "./aiImportRequests";

/** What a drop or a restore is told: the entry, and the version the page showed. */
export interface EntryRef {
  batchId: string;
  entryId: string;
  version: number;
}

/** What an import answers: how many questions and case studies went into the quiz. */
export type ImportOutcome = { ok: true; questions: number; caseStudies: number } | AiImportFailure;

/** The Server Functions the page hands in (`src/app/author/aiImportActions.ts`). */
export interface AiImportReviewActions {
  drop: (input: EntryRef) => EntryChange;
  restore: (input: EntryRef) => EntryChange;
  /** #348: every kept entry into the quiz, all or nothing. Without it, importing is unavailable. */
  importBatch?: (input: { batchId: string }) => Promise<ImportOutcome>;
  /** #348: the batch, its staged questions and its uploaded files deleted. */
  discard?: (input: { batchId: string }) => Promise<{ ok: true } | AiImportFailure>;
}

export interface AiImportReviewProps {
  bankId: string;
  quizName: string;
  batchId: string;
  fileNames: string[];
  entries: ReviewEntryView[];
  actions: AiImportReviewActions;
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
}: AiImportReviewProps) {
  const id = useId();
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importInFlight = useRef(false);
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

  const runImport = async () => {
    const importBatch = actions.importBatch;
    if (!importBatch || importInFlight.current) return;
    importInFlight.current = true;
    setImporting(true);
    setImportError(null);
    try {
      const result = await importBatch({ batchId });
      if (result.ok) {
        setImported(importedSentence(result.questions, result.caseStudies, quizName));
        router.refresh();
      } else {
        setImportError(result.message);
      }
    } catch {
      setImportError(UNEXPECTED);
    } finally {
      importInFlight.current = false;
      setImporting(false);
    }
  };

  const blocked = summary.blockers.length > 0;
  if (imported) {
    return (
      <section aria-labelledby={`${id}-done`} className="sm:max-w-2xl">
        <Card className="flex flex-col items-start gap-3">
          <h2 id={`${id}-done`} className="font-read text-2xl text-ink-1">
            Imported
          </h2>
          <p role="status" className="text-ink-1">
            {imported}
          </p>
          <TextLink href={`/author/banks/${bankId}`}>Open {quizName}</TextLink>
        </Card>
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby={`${id}-import`} className="sm:max-w-2xl">
        <Card className="flex flex-col gap-3">
          <h2 id={`${id}-import`} className="font-read text-2xl text-ink-1">
            Review the questions
          </h2>
          <p className="text-sm text-ink-2">Nothing has been added to {quizName} yet.</p>
          <div className="flex flex-wrap items-center gap-3">
            {/* aria-disabled while importing, not disabled: a disabled button drops focus. */}
            <Button
              variant="primary"
              disabled={blocked || !actions.importBatch}
              aria-disabled={importing || undefined}
              aria-describedby={`${id}-why`}
              onClick={runImport}
              data-testid="import-button"
            >
              {importing ? "Importing…" : summary.label}
            </Button>
            {/* The way back to the quiz is the breadcrumb above, which names it (#563). */}
          </div>
          <div id={`${id}-why`} className="text-sm text-ink-1">
            {blocked ? (
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {summary.blockers.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : actions.importBatch ? null : (
              <p className="text-ink-2">
                Importing is not available yet. Your review is kept until then.
              </p>
            )}
            {/* Always rendered: a region that appears with its text already in it is often not read. */}
            <div aria-live="polite">
              {importError ? <FieldError>{importError}</FieldError> : null}
            </div>
          </div>
          {actions.discard ? (
            <AiImportDiscard batchId={batchId} bankId={bankId} discard={actions.discard} />
          ) : null}
        </Card>
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
              // At rest, a secondary button's 3:1 edge (WCAG 1.4.11); pressed, the selected fill.
              className={`tap-target rounded-md border px-3 text-sm font-semibold ${PRESS_CLASSES} ${
                active
                  ? "border-accent bg-accent-soft text-ink-1"
                  : "border-field-border bg-surface-1 text-ink-1 hover:bg-surface-2"
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
                editHref={`/author/banks/${bankId}/ai-import/${batchId}/${entry.id}`}
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
