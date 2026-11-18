"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Card } from "@/components/ui/Card";
import { TextLink } from "@/components/ui/TextLink";
import {
  editHref,
  filterCounts,
  groupByFile,
  importedSentence,
  matchesFilter,
  reviewHref,
  type ReviewEntryView,
  type ReviewFilter,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import type { AiImportFailure } from "@/lib/authoring/aiImportUpload";
import { ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import type { ItemType } from "@/lib/ngn/schemas";
import { UNEXPECTED } from "./AiImportDiscard";
import {
  AiImportImportPanel,
  type DropAllInput,
  type DropAllOutcome,
  type ImportOutcome,
} from "./AiImportImportPanel";
import { AiImportReviewEntry, type EntryChange } from "./AiImportReviewEntry";
import { AiImportReviewFilters } from "./AiImportReviewFilters";
import { postJson } from "./aiImportRequests";

export type { ImportOutcome } from "./AiImportImportPanel";

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
  /** #348: every kept entry into the quiz, all or nothing. Without it, importing is unavailable. */
  importBatch?: (input: { batchId: string }) => Promise<ImportOutcome>;
  /** #348: the batch, its staged questions and its uploaded files deleted. */
  discard?: (input: { batchId: string }) => Promise<{ ok: true } | AiImportFailure>;
  /** #593: every entry that needs an answer or a fix dropped at once. */
  dropAll?: (input: DropAllInput) => Promise<DropAllOutcome>;
  /** #593: a case study replaced by six separate questions. */
  split?: (input: EntryRef) => Promise<{ ok: true; questions: number } | AiImportFailure>;
}

export interface AiImportReviewProps {
  bankId: string;
  quizName: string;
  batchId: string;
  fileNames: string[];
  entries: ReviewEntryView[];
  actions: AiImportReviewActions;
  /** The filter named in the address (`?show=`), so a reload or Back keeps it (#593). */
  initialFilter?: ReviewFilter;
  /** #592: sentences about answers that reached no question. */
  notes?: string[];
}

/** What the screen knows of an entry ahead of the server's next answer. */
type Override = { version: number; status?: ReviewStatus };

/** Each entry another change moved on a version, so its next change names the right one. */
const movedOn = (changed: readonly { id: string; version: number }[] = []) =>
  Object.fromEntries(changed.map((row) => [row.id, { version: row.version }]));

const FAILED: AiImportFailure = { ok: false, code: "unavailable", message: UNEXPECTED };

/**
 * Review an AI import batch (#346): every staged question under its file in source order,
 * filtered by status, each drawn by the real players with its key, its reasons and its source.
 * The teacher drops or restores a question, or has one read again as another type. Each change
 * names the version it was shown, so two tabs cannot overwrite each other.
 *
 * Since #593 the filter lives in the address, and a card that leaves the filter (dropped under
 * "Needs a fix", say) hands its confirmation to the line above the list, which takes the focus
 * the card had: neither is lost with the card.
 */
export function AiImportReview({
  bankId,
  quizName,
  batchId,
  fileNames,
  entries: served,
  actions,
  initialFilter = "all",
  notes = [],
}: AiImportReviewProps) {
  const id = useId();
  const router = useRouter();
  const base = `/author/banks/${bankId}/ai-import/${batchId}`;
  const [imported, setImported] = useState<string | null>(null);
  const [filter, setFilter] = useState<ReviewFilter>(initialFilter);
  // What a card that left the filter would have said, and a count so the same words focus again.
  const [gone, setGone] = useState<{ text: string; times: number } | null>(null);
  const goneRef = useRef<HTMLParagraphElement>(null);
  // A drop or restore shows at once; a newer version from the server (a refresh) wins.
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const entries = served.map((entry) => {
    const override = overrides[entry.id];
    if (!override || override.version <= entry.version) return entry;
    return { ...entry, version: override.version, status: override.status ?? entry.status };
  });

  useEffect(() => {
    if (gone) goneRef.current?.focus();
  }, [gone]);

  const counts = filterCounts(entries);
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

  const say = (text: string) => setGone((now) => ({ text, times: (now?.times ?? 0) + 1 }));

  const chooseFilter = (next: ReviewFilter) => {
    setFilter(next);
    setGone(null);
    // The address follows the filter without a navigation, so Back and a reload keep it.
    window.history.replaceState(null, "", reviewHref(base, next));
  };

  const change =
    (act: (input: EntryRef) => EntryChange, done: (heading: string) => string) =>
    async (entry: ReviewEntryView): EntryChange => {
      // #593: a rejected request is an answer too, so the card can say it and be used again.
      const result = await act({ batchId, entryId: entry.id, version: entry.version }).catch(
        () => FAILED,
      );
      if (!result.ok) return result;
      setOverrides((now) => ({
        ...now,
        ...movedOn(result.changed),
        [entry.id]: { version: result.version, status: result.status },
      }));
      if (!matchesFilter({ ...entry, status: result.status }, filter)) {
        say(done(headingOf(entry)));
      }
      // The duplicate flags may have changed on other cards (#593); read them again.
      router.refresh();
      return result;
    };

  const retype = async (
    entry: ReviewEntryView,
    type: ItemType,
  ): Promise<{ ok: true } | AiImportFailure> => {
    const result = await postJson<{ ok: true; version: number; status: ReviewStatus }>(
      "/api/ai-import/retype",
      { batchId, entryId: entry.id, version: entry.version, type },
    ).catch(() => FAILED);
    if (!result.ok) return result;
    if (!matchesFilter({ ...entry, status: result.status }, filter)) {
      say(`${headingOf(entry)} was read again as ${ITEM_TYPE_LABELS[type]}.`);
    }
    router.refresh();
    return { ok: true };
  };

  const split = async (entry: ReviewEntryView): Promise<{ ok: true } | AiImportFailure> => {
    if (!actions.split) return FAILED;
    const result = await actions.split({ batchId, entryId: entry.id, version: entry.version });
    if (!result.ok) return result;
    say(`${headingOf(entry)} is now ${result.questions} separate questions.`);
    router.refresh();
    return { ok: true };
  };

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
          <TextLink href={`/author/banks/${bankId}?status=draft`}>
            Show its draft questions
          </TextLink>
        </Card>
      </section>
    );
  }
  return (
    <div className="flex flex-col gap-8">
      <AiImportImportPanel
        bankId={bankId}
        quizName={quizName}
        batchId={batchId}
        entries={entries}
        notes={notes}
        importBatch={actions.importBatch}
        discard={actions.discard}
        dropAll={actions.dropAll}
        onImported={(outcome) => {
          setImported(importedSentence(outcome.questions, outcome.caseStudies, quizName));
          router.refresh();
        }}
        onDroppedAll={({ dropped, left, changed }) => {
          setOverrides((now) => ({
            ...now,
            ...movedOn(changed),
            ...Object.fromEntries(
              dropped.map((row) => [row.id, { version: row.version, status: "dropped" as const }]),
            ),
          }));
          const kept =
            left > 0
              ? ` ${left} changed in another tab and ${left === 1 ? "was" : "were"} left.`
              : "";
          say(`Dropped ${dropped.length}.${kept}`);
          router.refresh();
        }}
      />

      <AiImportReviewFilters
        filter={filter}
        counts={counts}
        onChoose={chooseFilter}
        notice={gone?.text ?? null}
        noticeRef={goneRef}
      />

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
                fileName={group.name}
                editHref={editHref(base, entry.id, filter)}
                stepHref={(step) => editHref(base, entry.id, filter, step)}
                onSplit={actions.split ? split : undefined}
                onDrop={change(
                  actions.drop,
                  (heading) => `Dropped. ${heading} will not be imported.`,
                )}
                onRestore={change(
                  actions.restore,
                  (heading) => `Restored. ${heading} is back in the import.`,
                )}
                onRetype={retype}
              />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
