"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import {
  BULK_IMPORT_ERRORS,
  IMPORT_MAX_FILES,
  planImport,
  reportSummary,
  type FileImportResult,
  type FileReport,
  type ImportStep,
} from "@/lib/authoring/bulkImport";
import { folderOptions, UNFILED, type FolderRow } from "@/lib/authoring/folders";
import { IMPORT_MAX_ITEMS } from "@/lib/authoring/transfer";

export interface ImportJsonFormProps {
  /** Imports one file (or pasted JSON) into the bank; called once per file. */
  action: (formData: FormData) => Promise<FileImportResult>;
  folders: readonly FolderRow[];
  /** The folder the import starts on: the open folder, otherwise Unfiled. */
  defaultFolderId?: string;
}

type Report =
  | { kind: "none" }
  | { kind: "refused"; error: string }
  | { kind: "files"; summary: string; files: FileReport[] };

const fieldClass =
  "w-full rounded-sm border border-line bg-surface-1 px-3 py-2 text-base text-ink-1 hover:border-line-strong";

/**
 * Imports learn.v1 exports into a bank: several files, pasted JSON, or both, optionally into a
 * folder. Each file is sent on its own and lands whole or not at all; the report then says, file
 * by file, what arrived as drafts and why anything was refused.
 */
export function ImportJsonForm({ action, folders, defaultFolderId }: ImportJsonFormProps) {
  // Controlled, so a re-render after each file never wipes what was pasted.
  const [json, setJson] = useState("");
  const [running, setRunning] = useState<{ current: number; total: number } | null>(null);
  const [report, setReport] = useState<Report>({ kind: "none" });
  const fileRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const options = folderOptions(folders);

  async function send(
    step: ImportStep,
    files: readonly File[],
    folder: string,
  ): Promise<FileImportResult> {
    if (step.kind === "refused") return { status: "error", errors: step.errors };
    const data = new FormData();
    if (step.kind === "file") {
      const file = files[step.index];
      if (!file) return { status: "error", errors: [BULK_IMPORT_ERRORS.unsent] };
      data.set("file", file);
    } else {
      data.set("json", json);
    }
    data.set("folder", folder);
    try {
      return await action(data);
    } catch {
      return { status: "error", errors: [BULK_IMPORT_ERRORS.unsent] };
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;
    // Read from the input rather than the form data, where no choice at all is one empty file.
    const files = Array.from(fileRef.current?.files ?? []);
    const folder = String(new FormData(event.currentTarget).get("folder") ?? UNFILED);
    const plan = planImport(files, json);
    if (!plan.ok) {
      setReport({ kind: "refused", error: plan.error });
      return;
    }
    setReport({ kind: "none" });

    // One file at a time, so every request stays under the body limit and the report keeps order.
    const reports: FileReport[] = [];
    for (const [index, step] of plan.steps.entries()) {
      setRunning({ current: index + 1, total: plan.steps.length });
      reports.push({ label: step.label, ...(await send(step, files, folder)) });
    }
    setRunning(null);

    // What was sent is cleared, so pressing Import again cannot copy it twice. Refused pasted
    // JSON stays, so it can be fixed.
    if (fileRef.current) fileRef.current.value = "";
    if (reports.at(-1)?.status === "done" && plan.steps.at(-1)?.kind === "pasted") setJson("");
    const folderName = options.find((option) => option.id === folder)?.path ?? null;
    setReport({ kind: "files", summary: reportSummary(reports, folderName), files: reports });
  }

  const imported = report.kind === "files" ? report.files.filter((f) => f.status === "done") : [];
  const refused = report.kind === "files" ? report.files.filter((f) => f.status === "error") : [];

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 sm:max-w-xl">
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-file`} className="text-sm font-medium text-ink-1">
          JSON files
        </label>
        <input
          ref={fileRef}
          id={`${id}-file`}
          name="file"
          type="file"
          multiple
          accept=".json,application/json"
          aria-describedby={`${id}-hint`}
          className="text-sm text-ink-1 file:tap-target file:mr-3 file:rounded-sm file:border file:border-line file:bg-surface-1 file:px-3 file:text-ink-1"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-json`} className="text-sm font-medium text-ink-1">
          Or paste JSON
        </label>
        <textarea
          id={`${id}-json`}
          rows={6}
          spellCheck={false}
          value={json}
          onChange={(event) => setJson(event.target.value)}
          className={`${fieldClass} font-mono text-sm`}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <label htmlFor={`${id}-folder`} className="text-sm font-medium text-ink-1">
          Import into
        </label>
        <select
          id={`${id}-folder`}
          name="folder"
          defaultValue={defaultFolderId ?? UNFILED}
          className="tap-target max-w-full rounded-sm border border-line bg-surface-1 px-3 text-base text-ink-1 hover:border-line-strong"
        >
          <option value={UNFILED}>Unfiled</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.path}
            </option>
          ))}
        </select>
      </div>
      <p id={`${id}-hint`} className="text-sm text-ink-2">
        Items and case studies arrive as new drafts. Nothing already in this bank is changed. Choose
        up to {IMPORT_MAX_FILES} files. Each file imports whole or not at all: up to{" "}
        {IMPORT_MAX_ITEMS} items or one case study, at most 800 KB.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={running !== null}>
          Import
        </Button>
        {running ? (
          <p role="status" className="text-sm text-ink-2">
            Importing file {running.current} of {running.total}.
          </p>
        ) : null}
      </div>
      {report.kind === "refused" ? (
        <div role="alert" className="rounded-sm border border-line bg-surface-1 p-4 text-sm">
          <p className="font-medium text-incorrect">Nothing was imported.</p>
          <p className="mt-2 text-ink-1">{report.error}</p>
        </div>
      ) : null}
      {report.kind === "files" ? (
        <div role="status" className="flex flex-col gap-2 text-sm">
          <p className="font-medium text-ink-1">{report.summary}</p>
          {imported.length > 0 ? (
            <ul
              aria-label="Imported files"
              className="flex list-disc flex-col gap-1 pl-5 text-ink-2"
            >
              {imported.map((file, index) => (
                <li key={`${file.label}-${index}`}>
                  <span className="font-medium break-words text-ink-1">{file.label}</span>:{" "}
                  {file.status === "done" ? file.message : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {refused.length > 0 ? (
        <div role="alert" className="rounded-sm border border-line bg-surface-1 p-4 text-sm">
          <ul aria-label="Refused files" className="flex flex-col gap-3">
            {refused.map((file, index) => (
              <li key={`${file.label}-${index}`}>
                <p className="font-medium text-incorrect">
                  <span className="break-words">{file.label}</span>: Nothing was imported.
                </p>
                <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-ink-1">
                  {(file.status === "error" ? file.errors : []).map((error, line) => (
                    <li key={line}>{error}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </form>
  );
}
