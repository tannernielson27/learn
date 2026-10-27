"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { fieldClasses } from "@/components/ui/fieldClasses";
import {
  STATUS_LABELS,
  retypeChoices,
  type ReviewEntryView,
  type ReviewStatus,
} from "@/lib/authoring/aiImportReview";
import type { AiImportFailure } from "@/lib/authoring/aiImportUpload";
import { ITEM_TYPE_LABELS } from "@/lib/ngn/labels";
import type { ItemType } from "@/lib/ngn/schemas";
import { AiImportEntryPreview } from "./AiImportEntryPreview";
import { FieldError } from "./FieldError";

export type EntryChange = Promise<
  { ok: true; version: number; status: ReviewStatus } | AiImportFailure
>;

export interface AiImportReviewEntryProps {
  entry: ReviewEntryView;
  /** "Question 3", or the case study's title. */
  heading: string;
  /** The entry's edit page (#347); offered for a single question with a type, not dropped. */
  editHref?: string;
  onDrop: (entry: ReviewEntryView) => EntryChange;
  onRestore: (entry: ReviewEntryView) => EntryChange;
  /** Reads the question again as `type`; resolves once the page has the new reading. */
  onRetype: (entry: ReviewEntryView, type: ItemType) => Promise<{ ok: true } | AiImportFailure>;
}

/**
 * The status as a word, with a rule beside it: amber (the flag colour) for what needs the
 * teacher, neutral otherwise. Green and red stay for feedback (docs/04 §1), and colour is never
 * the only signal.
 */
const TONE: Record<ReviewStatus, string> = {
  ready: "border-line-strong",
  needs_answer: "border-flag",
  needs_fix: "border-flag",
  not_importable: "border-line-strong",
  dropped: "border-line",
};

type Pending = "drop" | "restore" | "retype" | null;

/** One staged question or case study on the review screen (#346). */
export function AiImportReviewEntry({
  entry,
  heading,
  editHref,
  onDrop,
  onRestore,
  onRetype,
}: AiImportReviewEntryProps) {
  const id = useId();
  const [showSource, setShowSource] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState<{ kind: "status" | "alert"; text: string } | null>(null);
  const choices = retypeChoices(entry);
  const [type, setType] = useState<ItemType | "">("");
  const dropped = entry.status === "dropped";
  // A case study has its own builder, and a question with no NGN type has no editor.
  const editable = editHref && entry.kind === "item" && entry.type !== null && !dropped;

  async function run(
    kind: Exclude<Pending, null>,
    work: () => Promise<{ ok: boolean } | AiImportFailure>,
    done: string,
  ) {
    setPending(kind);
    setNote(
      kind === "retype"
        ? { kind: "status", text: "Reading the question again. This can take a minute." }
        : null,
    );
    const result = await work();
    setPending(null);
    if (result.ok && kind === "retype") setType("");
    setNote(
      result.ok
        ? { kind: "status", text: done }
        : { kind: "alert", text: (result as AiImportFailure).message },
    );
  }

  const typeLabel =
    entry.kind === "case_study"
      ? "Case study"
      : entry.type
        ? ITEM_TYPE_LABELS[entry.type]
        : "No NGN type";

  return (
    <article
      aria-labelledby={`${id}-heading`}
      className={`flex flex-col gap-4 border-l-4 bg-surface-1 py-4 pr-3 pl-4 ${TONE[entry.status]}`}
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id={`${id}-heading`} className="font-read text-xl break-words text-ink-1">
          {heading}
        </h3>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
          {typeLabel}
          <span aria-hidden="true">·</span>
          <Badge data-testid="entry-status">{STATUS_LABELS[entry.status]}</Badge>
        </p>
      </header>

      {entry.reasons.length > 0 ? (
        <ul
          aria-label="What to check"
          className="flex list-disc flex-col gap-1 pl-5 text-sm text-ink-1"
        >
          {entry.reasons.map((reason, index) => (
            <li key={`${reason.code}-${index}`}>{reason.message}</li>
          ))}
        </ul>
      ) : null}

      {dropped ? (
        <p className="text-sm text-ink-2">Dropped.</p>
      ) : (
        <div className={`grid min-w-0 gap-4 ${showSource ? "lg:grid-cols-2" : ""}`}>
          <section aria-label={`${heading}, preview`} className="min-w-0">
            <Card padding="sm">
              <AiImportEntryPreview
                key={entry.version}
                kind={entry.kind}
                item={entry.item}
                label={heading}
              />
            </Card>
          </section>
          {showSource ? (
            <section id={`${id}-source`} aria-label={`${heading}, source`} className="min-w-0">
              <Card padding="sm">
                <p className="eyebrow mb-2">From the document</p>
                <p className="font-read text-base break-words whitespace-pre-wrap text-ink-1">
                  {entry.sourceExcerpt || "The document's text for this question was not kept."}
                </p>
              </Card>
            </section>
          ) : null}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {editable ? (
          <Link
            href={editHref}
            aria-label={`Edit ${heading}`}
            className={buttonClasses({ size: "sm" })}
          >
            Edit
          </Link>
        ) : null}
        {dropped ? null : (
          <Button
            size="sm"
            aria-expanded={showSource}
            aria-controls={showSource ? `${id}-source` : undefined}
            onClick={() => setShowSource((shown) => !shown)}
          >
            {showSource ? "Hide source" : "Show source"}
          </Button>
        )}
        {dropped ? (
          <Button
            size="sm"
            disabled={pending !== null}
            onClick={() =>
              run("restore", () => onRestore(entry), `Restored. ${heading} is back in the import.`)
            }
          >
            Restore
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={pending !== null}
            onClick={() =>
              run("drop", () => onDrop(entry), `Dropped. ${heading} will not be imported.`)
            }
          >
            Drop
          </Button>
        )}
      </div>

      {choices.length > 0 && !dropped ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (type === "" || pending !== null) return;
            void run(
              "retype",
              () => onRetype(entry, type),
              `Read again as ${ITEM_TYPE_LABELS[type]}.`,
            );
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm text-ink-1">
              Change type
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ItemType | "")}
                disabled={pending !== null}
                aria-describedby={`${id}-cost`}
                className={fieldClasses("px-2 text-base")}
              >
                <option value="">Choose a type</option>
                {choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" size="sm" disabled={type === "" || pending !== null}>
              Read again as this type
            </Button>
          </div>
          <p id={`${id}-cost`} className="text-sm text-ink-2">
            Claude reads this question again. It counts towards this month&apos;s AI import
            allowance.
          </p>
        </form>
      ) : null}

      {note?.kind === "alert" ? <FieldError role="alert">{note.text}</FieldError> : null}
      {note?.kind === "status" ? (
        <p role="status" className="text-sm text-ink-2">
          {note.text}
        </p>
      ) : null}
    </article>
  );
}
