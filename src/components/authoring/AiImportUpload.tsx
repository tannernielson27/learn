"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { driveBatch, type DriverIo } from "@/lib/authoring/aiImportDriver";
import {
  AI_IMPORT_ACCEPT,
  AI_IMPORT_MAX_FILES,
  AI_IMPORT_MAX_PAGES,
  AI_IMPORT_MAX_QUESTIONS,
  RIGHTS_LABEL,
  allowanceLine,
  checkChosenFiles,
  describeFile,
  messageFor,
  trackFile,
  type AiImportFailure,
  type BatchStatus,
  type BatchView,
  type TrackedFile,
} from "@/lib/authoring/aiImportUpload";
import { AiImportFileRows, type FileRow } from "./AiImportFileRows";
import { uploadToStorage, postJson } from "./aiImportRequests";

type Result<T> = Promise<({ ok: true } & T) | AiImportFailure>;

/** The Server Functions the page hands in (`src/app/author/aiImportActions.ts`). */
export interface AiImportActions {
  start: (bankId: string, rightsConfirmed: boolean) => Result<{ batchId: string }>;
  register: (
    batchId: string,
    name: string,
  ) => Result<{ fileId: string; storagePath: string; contentType: string; name: string }>;
  check: (
    batchId: string,
    fileId: string,
  ) => Result<
    { status: "ready"; pages: number; chunks: number } | { status: "rejected"; reason: string }
  >;
  remove: (batchId: string, fileId: string) => Result<object>;
  begin: (batchId: string) => Result<{ batch: BatchView }>;
  finish: (batchId: string) => Result<object>;
}

export interface AiImportUploadProps {
  bankId: string;
  quizName: string;
  allowance: { remainingUsd: number; remainingPages: number | null } | null;
  initial: BatchView | null;
  actions: AiImportActions;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const LEFT = { ok: false as const, code: "cancelled", message: "" };

/** Once the page is left, nothing more is sent: each request that would follow answers `cancelled`. */
const io = (actions: AiImportActions, left: { current: boolean }): DriverIo => ({
  parse: async (batchId, fileId, position) =>
    left.current ? LEFT : postJson("/api/ai-import/parse", { batchId, fileId, position }),
  extract: async (batchId, fileId, unit) =>
    left.current ? LEFT : postJson("/api/ai-import/extract", { batchId, fileId, unit }),
  finish: (batchId) => actions.finish(batchId),
  sleep,
});

/**
 * Upload documents for AI import and watch each one read (#345). The files go straight from the
 * browser to private Storage under the teacher's own session; the page then asks the server to
 * read each part and find each question, and shows how far each file has got. A reload picks up
 * where it stopped, from the batch as stored.
 */
export function AiImportUpload({
  bankId,
  quizName,
  allowance,
  initial,
  actions,
}: AiImportUploadProps) {
  const router = useRouter();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [batchId, setBatchId] = useState<string | null>(initial?.id ?? null);
  const [status, setStatus] = useState<BatchStatus>(initial?.status ?? "uploading");
  const [files, setFiles] = useState<TrackedFile[]>(() => (initial?.files ?? []).map(trackFile));
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [alert, setAlert] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const patch = (key: string, change: Partial<TrackedFile>) =>
    setFiles((list) => list.map((file) => (file.key === key ? { ...file, ...change } : file)));

  async function read(batch: BatchView) {
    setStatus("parsing");
    setFiles(batch.files.map(trackFile));
    setAlert([]);
    const base = new Map(batch.files.map((file) => [file.id, file.questions]));
    const result = await driveBatch(batch, io(actions, left), {
      chunkRead: (fileId, position) =>
        setFiles((list) =>
          list.map((file) =>
            file.fileId === fileId
              ? {
                  ...file,
                  chunks: file.chunks.map((chunk) =>
                    chunk.position === position ? { ...chunk, status: "done" as const } : chunk,
                  ),
                }
              : file,
          ),
        ),
      unitsProgress: (fileId, done, total, staged) =>
        patch(fileId, { units: { done, total }, questions: (base.get(fileId) ?? 0) + staged }),
      fileFailed: (fileId, message) => patch(fileId, { failed: message }),
      overLimit: (count) =>
        setNote(
          `${count} more ${count === 1 ? "question was" : "questions were"} left out: an import holds at most ${AI_IMPORT_MAX_QUESTIONS}.`,
        ),
    });
    if (left.current) return;
    if (result.status === "review") {
      setStatus("review");
      // Through the router, so the page is read again for this batch whatever the address held.
      router.replace(`?batch=${batch.id}`, { scroll: false });
    } else if (result.status === "stopped") {
      setAlert([result.failure.message]);
    } else {
      setAlert([result.failure?.message ?? "Some files could not be read. Try again."]);
    }
  }

  async function begin(current: string) {
    const begun = await actions.begin(current);
    if (!begun.ok) {
      setAlert([begun.message]);
      return;
    }
    await read(begun.batch);
  }

  const left = useRef(false);
  useEffect(() => {
    // Set again on mount, as development mounts every component twice.
    left.current = false;
    return () => {
      left.current = true;
    };
  }, []);

  // A reload while files were being read carries on reading them.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || initial?.status !== "parsing") return;
    resumed.current = true;
    setBusy(true);
    void read(initial).finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the first render
  }, []);

  async function uploadOne(current: string, file: File) {
    const key = `local-${file.name}-${Math.random()}`;
    setFiles((list) => [
      ...list,
      {
        key,
        fileId: null,
        name: file.name,
        status: "pending",
        reason: null,
        pages: null,
        chunks: [],
        units: null,
        questions: 0,
        note: "Uploading.",
        failed: null,
      },
    ]);
    const registered = await actions.register(current, file.name);
    if (!registered.ok) {
      patch(key, { status: "local", reason: registered.message, note: null });
      return;
    }
    patch(key, { fileId: registered.fileId, name: registered.name });
    const uploaded = await uploadToStorage(registered.storagePath, file, registered.contentType);
    if (!uploaded) {
      patch(key, { note: null, reason: messageFor("upload_failed") });
      return;
    }
    patch(key, { note: "Checking the file." });
    const checked = await actions.check(current, registered.fileId);
    if (!checked.ok) patch(key, { note: null });
    else if (checked.status === "rejected")
      patch(key, { status: "rejected", reason: checked.reason, note: null });
    else patch(key, { status: "ready", pages: checked.pages, note: null });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const chosen = Array.from(inputRef.current?.files ?? []);
    const hasReady = files.some((file) => file.status === "ready");
    const problems = [
      ...(rights || batchId ? [] : [messageFor("rights")]),
      ...(chosen.length === 0 && hasReady
        ? []
        : checkChosenFiles(
            chosen,
            AI_IMPORT_MAX_FILES - files.filter((f) => f.status !== "local").length,
          )),
    ];
    if (problems.length > 0) {
      setAlert(problems);
      return;
    }
    setAlert([]);
    setBusy(true);
    try {
      let current = batchId;
      if (!current) {
        const started = await actions.start(bankId, rights);
        if (!started.ok) {
          setAlert([started.message]);
          return;
        }
        current = started.batchId;
        setBatchId(current);
        // Kept in the address, so a reload opens this import again.
        window.history.replaceState(null, "", `?batch=${current}`);
      }
      // A file left pending by an earlier visit may have uploaded before the tab closed.
      for (const file of files) {
        if (file.status !== "pending" || !file.fileId) continue;
        const checked = await actions.check(current, file.fileId);
        if (checked.ok && checked.status === "ready") {
          patch(file.key, { status: "ready", pages: checked.pages });
        } else if (checked.ok) {
          patch(file.key, { status: "rejected", reason: checked.reason });
        }
      }
      for (const file of chosen) await uploadOne(current, file);
      if (inputRef.current) inputRef.current.value = "";
      await begin(current);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: FileRow) {
    if (!batchId || !row.fileId) {
      setFiles((list) => list.filter((file) => file.key !== row.key));
      return;
    }
    setBusy(true);
    const removed = await actions.remove(batchId, row.fileId);
    setBusy(false);
    if (removed.ok) setFiles((list) => list.filter((file) => file.key !== row.key));
    else setAlert([removed.message]);
  }

  async function retry() {
    if (!batchId) return;
    setBusy(true);
    try {
      await begin(batchId);
    } finally {
      setBusy(false);
    }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (inputRef.current && event.dataTransfer.files.length > 0) {
      inputRef.current.files = event.dataTransfer.files;
    }
  }

  const rows: FileRow[] = files.map((file) => ({
    key: file.key,
    fileId: file.fileId,
    name: file.name,
    removable: status === "uploading" && file.status !== "ready",
    ...describeFile(file, status),
  }));
  const questions = files.reduce((sum, file) => sum + file.questions, 0);

  if (status === "review") {
    return (
      <section aria-labelledby={`${id}-review`} className="flex flex-col gap-4 sm:max-w-2xl">
        <AiImportFileRows rows={rows} busy={false} />
        <h2 id={`${id}-review`} className="font-read text-2xl text-ink-1">
          Ready for review
        </h2>
        <p role="status" className="text-ink-1">
          {questions} {questions === 1 ? "question is" : "questions are"} waiting for review.
          Nothing has been added to {quizName} yet.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          {batchId ? (
            <Link
              href={`/author/banks/${bankId}/ai-import/${batchId}`}
              className="tap-target inline-flex items-center rounded-sm border border-accent bg-accent px-4 font-medium text-accent-contrast hover:bg-accent-ink"
            >
              Review the questions
            </Link>
          ) : null}
          <Link
            href={`/author/banks/${bankId}`}
            className="tap-target inline-flex items-center text-accent-ink underline"
          >
            Back to {quizName}
          </Link>
        </div>
      </section>
    );
  }

  const reading = status === "parsing";
  return (
    <form onSubmit={submit} className="flex flex-col gap-6 sm:max-w-2xl" aria-busy={busy}>
      {allowance ? (
        <p className="text-sm text-ink-2">
          {allowanceLine(allowance.remainingUsd, allowance.remainingPages)}
        </p>
      ) : null}
      {reading ? null : (
        <>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={drop}
            className={`flex flex-col gap-2 rounded-sm border border-dashed p-4 transition-colors duration-150 motion-reduce:transition-none ${dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-1"}`}
          >
            <label htmlFor={`${id}-files`} className="text-sm font-medium text-ink-1">
              Documents
            </label>
            <input
              ref={inputRef}
              id={`${id}-files`}
              type="file"
              multiple
              accept={AI_IMPORT_ACCEPT}
              aria-describedby={`${id}-hint`}
              disabled={busy}
              className="text-sm text-ink-1 file:tap-target file:mr-3 file:rounded-sm file:border file:border-line file:bg-surface-1 file:px-3 file:text-ink-1"
            />
            <p id={`${id}-hint`} className="text-sm text-ink-2">
              Choose or drop up to {AI_IMPORT_MAX_FILES} files: PDF, Word .docx, Markdown or text,
              each at most 25 MB, {AI_IMPORT_MAX_PAGES} pages and {AI_IMPORT_MAX_QUESTIONS}{" "}
              questions in all. Claude copies the questions; nothing reaches {quizName} until you
              review it.
            </p>
            <p className="text-sm">
              <Link
                href="/help/instructor#ai-import"
                className="text-accent-ink underline underline-offset-4 hover:no-underline"
              >
                How AI import works
              </Link>
            </p>
          </div>
          {batchId ? null : (
            <label className="tap-target flex items-start gap-3 text-sm text-ink-1">
              <input
                type="checkbox"
                checked={rights}
                onChange={(event) => setRights(event.target.checked)}
                className="mt-1"
              />
              <span>{RIGHTS_LABEL}</span>
            </label>
          )}
        </>
      )}
      <AiImportFileRows rows={rows} busy={busy} onRemove={remove} />
      {note ? <p className="text-sm text-ink-2">{note}</p> : null}
      {alert.length > 0 ? (
        <div
          role="alert"
          className="rounded-sm border border-line bg-surface-1 p-4 text-sm text-ink-1"
        >
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {alert.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        {reading ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={retry}>
            Try again
          </Button>
        ) : (
          <Button type="submit" variant="primary" disabled={busy}>
            Upload and read
          </Button>
        )}
        {busy ? (
          <p role="status" className="text-sm text-ink-2">
            {reading ? "Reading your files. You can leave this page and come back." : "Uploading."}
          </p>
        ) : null}
      </div>
    </form>
  );
}
