"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
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
import { AiImportReviewEntry, type EntryChange } from "./AiImportReviewEntry";
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

const UNEXPECTED = "That did not work. Try again.";

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
      <section
        aria-labelledby={`${id}-done`}
        className="flex flex-col gap-3 rounded-sm border border-line bg-surface-1 p-4 sm:max-w-2xl"
      >
        <h2 id={`${id}-done`} className="font-read text-2xl text-ink-1">
          Imported
        </h2>
        <p role="status" className="text-ink-1">
          {imported}
        </p>
        <Link
          href={`/author/banks/${bankId}`}
          className="tap-target inline-flex items-center text-accent-ink underline"
        >
          Open {quizName}
        </Link>
      </section>
    );
  }
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
          ) : actions.importBatch ? null : (
            <p className="text-ink-2">
              Importing is not available yet. Your review is kept until then.
            </p>
          )}
          {/* Always rendered: a region that appears with its text already in it is often not read. */}
          <p aria-live="polite" className="text-incorrect">
            {importError}
          </p>
        </div>
        {actions.discard ? (
          <DiscardImport
            batchId={batchId}
            bankId={bankId}
            quizName={quizName}
            discard={actions.discard}
          />
        ) : null}
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

interface DiscardImportProps {
  batchId: string;
  bankId: string;
  quizName: string;
  discard: NonNullable<AiImportReviewActions["discard"]>;
}

/**
 * "Discard this import" (#348). Pressing it changes nothing: a dialog says what goes, and its own
 * button is the one that acts. Success goes back to the quiz; a refusal keeps the dialog open.
 */
function DiscardImport({ batchId, bankId, quizName, discard }: DiscardImportProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const inFlight = useRef(false);
  const messageId = useId();

  const close = () => {
    if (inFlight.current) return;
    setMessage(null);
    setOpen(false);
  };

  const confirm = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const result = await discard({ batchId });
      if (result.ok) {
        router.push(`/author/banks/${bankId}`);
        return;
      }
      setMessage(result.message);
    } catch {
      setMessage(UNEXPECTED);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Discard this import
        </Button>
      </div>
      <Dialog
        open={open}
        onClose={close}
        title="Discard this import?"
        description={`Every question found in these files is deleted, and so are the uploaded files. Nothing is added to ${quizName}.`}
        actions={
          <>
            <Button variant="ghost" onClick={close}>
              Keep reviewing
            </Button>
            {/* aria-disabled, not disabled: a disabled button drops focus mid-request. */}
            <Button
              variant="primary"
              aria-disabled={busy || undefined}
              aria-describedby={message ? messageId : undefined}
              onClick={confirm}
            >
              {busy ? "Discarding…" : "Discard"}
            </Button>
          </>
        }
      >
        {/* Always rendered: a region that appears with its text already in it is often not read. */}
        <p id={messageId} aria-live="polite" className="text-sm text-incorrect">
          {message}
        </p>
      </Dialog>
    </>
  );
}
