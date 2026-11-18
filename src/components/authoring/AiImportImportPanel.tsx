"use client";

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import {
  importConfirmation,
  importSummary,
  needsAttention,
  type ReviewEntryView,
} from "@/lib/authoring/aiImportReview";
import type { AiImportFailure } from "@/lib/authoring/aiImportUpload";
import { AiImportDiscard, UNEXPECTED } from "./AiImportDiscard";
import { FieldError } from "./FieldError";

/** What an import answers: how many questions and case studies went into the quiz. */
export type ImportOutcome = { ok: true; questions: number; caseStudies: number } | AiImportFailure;

/** What "Drop the N that need attention" answers: who was dropped, and how many were left. */
export type DropAllOutcome =
  | {
      ok: true;
      dropped: { id: string; version: number }[];
      left: number;
      changed?: { id: string; version: number }[];
    }
  | (AiImportFailure & {
      dropped?: { id: string; version: number }[];
      changed?: { id: string; version: number }[];
    });

export interface DropAllInput {
  batchId: string;
  entries: { entryId: string; version: number }[];
}

export interface AiImportImportPanelProps {
  bankId: string;
  quizName: string;
  batchId: string;
  /** Every entry of the batch as the screen has it now. */
  entries: ReviewEntryView[];
  /** #592: what to say about answers that reached no question; shown where the blockers are. */
  notes: string[];
  importBatch?: (input: { batchId: string }) => Promise<ImportOutcome>;
  discard?: (input: { batchId: string }) => Promise<{ ok: true } | AiImportFailure>;
  dropAll?: (input: DropAllInput) => Promise<DropAllOutcome>;
  onImported: (outcome: { questions: number; caseStudies: number }) => void;
  onDroppedAll: (outcome: Extract<DropAllOutcome, { ok: true }>) => void;
  /**
   * The bulk drop was refused or failed. Some entries may have been dropped before it stopped,
   * so the page takes what the answer names and reads the batch again.
   */
  onDropFailed?: (outcome?: Extract<DropAllOutcome, { ok: false }>) => void;
}

type Asking = "import" | "drop" | null;

const count = (n: number) => `${n} that ${n === 1 ? "needs" : "need"} attention`;

/**
 * The top of the review screen: what Import would bring in, what still blocks it, and the two
 * actions on the whole batch. Since #593 each asks first. Import says how many questions go into
 * which quiz and what is left out; "Drop the N that need attention" clears every blocker in one
 * step, for a teacher who has fixed what they wanted and does not want the rest.
 */
export function AiImportImportPanel({
  bankId,
  quizName,
  batchId,
  entries,
  notes,
  importBatch,
  discard,
  dropAll,
  onImported,
  onDroppedAll,
  onDropFailed,
}: AiImportImportPanelProps) {
  const id = useId();
  const [asking, setAsking] = useState<Asking>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const summary = importSummary(entries);
  const waiting = entries.filter(needsAttention);
  const blocked = summary.blockers.length > 0;

  const close = () => {
    if (inFlight.current) return;
    setAsking(null);
    setError(null);
  };

  /** One request at a time; a refusal or a failure stays in the dialog that asked. */
  async function confirm<R extends { ok: true } | AiImportFailure>(
    request: () => Promise<R>,
    done: (result: Extract<R, { ok: true }>) => void,
    failed?: (result?: Extract<R, { ok: false }>) => void,
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await request();
      if (result.ok) {
        setAsking(null);
        done(result as Extract<R, { ok: true }>);
      } else {
        setError(result.message);
        failed?.(result as Extract<R, { ok: false }>);
      }
    } catch {
      setError(UNEXPECTED);
      failed?.();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const runImport = () => {
    if (importBatch) void confirm(() => importBatch({ batchId }), onImported);
  };
  const runDrop = () => {
    if (!dropAll) return;
    const shown = waiting.map((entry) => ({ entryId: entry.id, version: entry.version }));
    void confirm(() => dropAll({ batchId, entries: shown }), onDroppedAll, onDropFailed);
  };

  return (
    <section aria-labelledby={`${id}-import`} className="sm:max-w-2xl">
      <Card className="flex flex-col gap-3">
        <h2 id={`${id}-import`} className="font-read text-2xl text-ink-1">
          Review the questions
        </h2>
        <p className="text-sm text-ink-2">Nothing has been added to {quizName} yet.</p>
        {notes.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm text-ink-1" data-testid="answer-notes">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={blocked || !importBatch}
            aria-describedby={`${id}-why`}
            onClick={() => setAsking("import")}
            data-testid="import-button"
          >
            {summary.label}
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
          ) : importBatch ? null : (
            <p className="text-ink-2">
              Importing is not available yet. Your review is kept until then.
            </p>
          )}
        </div>
        {dropAll && waiting.length > 0 ? (
          <div>
            <Button size="sm" onClick={() => setAsking("drop")} data-testid="drop-all-button">
              Drop the {count(waiting.length)}
            </Button>
          </div>
        ) : null}
        {discard ? <AiImportDiscard batchId={batchId} bankId={bankId} discard={discard} /> : null}
      </Card>

      <Dialog
        open={asking === "import"}
        onClose={close}
        title={`Import into ${quizName}?`}
        description={importConfirmation(entries, quizName).join(" ")}
        actions={
          <>
            <Button variant="ghost" onClick={close}>
              Keep reviewing
            </Button>
            {/* aria-disabled, not disabled: a disabled button drops focus mid-request. */}
            <Button
              variant="primary"
              aria-disabled={busy || undefined}
              aria-describedby={error ? `${id}-error` : undefined}
              onClick={runImport}
              data-testid="import-confirm"
            >
              {busy ? "Importing…" : "Import"}
            </Button>
          </>
        }
      >
        {/* Always rendered: a region that appears with its text already in it is often not read. */}
        <div id={`${id}-error`} aria-live="polite">
          {asking === "import" && error ? <FieldError>{error}</FieldError> : null}
        </div>
      </Dialog>

      <Dialog
        open={asking === "drop"}
        onClose={close}
        title={`Drop the ${count(waiting.length)}?`}
        description="They will not be imported. You can restore any of them under Dropped."
        actions={
          <>
            <Button variant="ghost" onClick={close}>
              Keep them
            </Button>
            <Button
              variant="primary"
              aria-disabled={busy || undefined}
              aria-describedby={error ? `${id}-drop-error` : undefined}
              onClick={runDrop}
              data-testid="drop-all-confirm"
            >
              {busy ? "Dropping…" : `Drop ${waiting.length}`}
            </Button>
          </>
        }
      >
        <div id={`${id}-drop-error`} aria-live="polite">
          {asking === "drop" && error ? <FieldError>{error}</FieldError> : null}
        </div>
      </Dialog>
    </section>
  );
}
